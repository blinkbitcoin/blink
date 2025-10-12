mod config;
mod jwks;

use async_graphql::*;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use axum_extra::headers::HeaderMap;
use serde::{Deserialize, Serialize};
use tracing::instrument;

use std::sync::Arc;

use crate::{
    app::{ApiKeysApp, ApplicationError},
    graphql,
    identity::IdentityApiKeyId,
    limits::Limits,
};

pub use config::*;
use jwks::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    sub: String,
    exp: u64,
    #[serde(default)]
    scope: String,
}

pub async fn run_server(config: ServerConfig, api_keys_app: ApiKeysApp) -> anyhow::Result<()> {
    let schema = graphql::schema(Some(api_keys_app.clone()));
    let limits = Arc::new(Limits::new(api_keys_app.pool()));

    let jwks_decoder = Arc::new(RemoteJwksDecoder::new(config.jwks_url.clone()));
    let decoder = jwks_decoder.clone();
    tokio::spawn(async move {
        decoder.refresh_keys_periodically().await;
    });

    // Spawn background task to cleanup old transaction records
    let cleanup_limits = limits.clone();
    tokio::spawn(async move {
        cleanup_old_transactions_periodically(cleanup_limits).await;
    });

    let app = Router::new()
        .route(
            "/graphql",
            get(playground).post(axum::routing::post(graphql_handler)),
        )
        .route(
            "/auth/check",
            get(check_handler).with_state((config.api_key_auth_header, api_keys_app)),
        )
        .route(
            "/limits/check",
            get(limits_check_handler).with_state(limits.clone()),
        )
        .route(
            "/limits/remaining",
            get(limits_remaining_handler).with_state(limits.clone()),
        )
        .route(
            "/spending/record",
            post(spending_record_handler).with_state(limits.clone()),
        )
        .with_state(JwtDecoderState {
            decoder: jwks_decoder,
        })
        .layer(Extension(schema));

    println!("Starting graphql server on port {}", config.port);
    let listener =
        tokio::net::TcpListener::bind(&std::net::SocketAddr::from(([0, 0, 0, 0], config.port)))
            .await?;
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}

#[derive(Debug, Serialize)]
struct CheckResponse {
    sub: String,
    scope: String,
    api_key_id: String,
}

#[derive(Debug, Deserialize)]
struct LimitsCheckQuery {
    api_key_id: String,
    amount_sats: i64,
}

#[derive(Debug, Serialize)]
struct LimitsCheckResponse {
    allowed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    remaining_sats: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    daily_limit_sats: Option<i64>,
    spent_last_24h_sats: i64,
}

#[derive(Debug, Deserialize)]
struct LimitsRemainingQuery {
    api_key_id: String,
}

#[derive(Debug, Serialize)]
struct LimitsRemainingResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    daily_limit_sats: Option<i64>,
    spent_last_24h_sats: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    remaining_sats: Option<i64>,
    transaction_count: i32,
}

#[derive(Debug, Deserialize)]
struct SpendingRecordRequest {
    api_key_id: String,
    amount_sats: i64,
    transaction_id: Option<String>,
}

#[instrument(
    name = "api-keys.server.check",
    skip_all,
    fields(key_id, sub, scope),
    err
)]
async fn check_handler(
    State((header, app)): State<(String, ApiKeysApp)>,
    headers: HeaderMap,
) -> Result<Json<CheckResponse>, ApplicationError> {
    tracing::http::extract_tracing(&headers);
    let key = headers.get(header).ok_or(ApplicationError::MissingApiKey)?;
    let (id, sub, scopes) = app.lookup_authenticated_subject(key.to_str()?).await?;
    let scope = scopes
        .into_iter()
        .map(|s| s.to_string())
        .collect::<Vec<String>>()
        .join(" ");
    let span = tracing::Span::current();
    span.record("key_id", &tracing::field::display(id));
    span.record("sub", &sub);
    span.record("scope", &scope);

    Ok(Json(CheckResponse {
        sub,
        scope,
        api_key_id: id.to_string(),
    }))
}

pub async fn graphql_handler(
    schema: Extension<Schema<graphql::Query, graphql::Mutation, EmptySubscription>>,
    Claims(jwt_claims): Claims<JwtClaims>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    let req = req.into_inner();
    let can_write = crate::scope::can_write(&jwt_claims.scope);
    schema
        .execute(req.data(graphql::AuthSubject {
            id: jwt_claims.sub,
            can_write,
        }))
        .await
        .into()
}

async fn playground() -> impl axum::response::IntoResponse {
    axum::response::Html(async_graphql::http::playground_source(
        async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
    ))
}

#[instrument(
    name = "api-keys.server.limits_check",
    skip_all,
    fields(api_key_id, amount_sats)
)]
async fn limits_check_handler(
    State(limits): State<Arc<Limits>>,
    Query(params): Query<LimitsCheckQuery>,
) -> Result<Json<LimitsCheckResponse>, (StatusCode, String)> {
    let api_key_id = params.api_key_id.parse::<IdentityApiKeyId>().map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Invalid API key ID: {}", e),
        )
    })?;

    let span = tracing::Span::current();
    span.record("api_key_id", &tracing::field::display(&api_key_id));
    span.record("amount_sats", params.amount_sats);

    let result = limits
        .check_spending_limit(api_key_id, params.amount_sats)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Calculate remaining from limit and spent
    let remaining_sats = result
        .daily_limit_sats
        .map(|limit| limit - result.spent_last_24h_sats);

    Ok(Json(LimitsCheckResponse {
        allowed: result.allowed,
        remaining_sats,
        daily_limit_sats: result.daily_limit_sats,
        spent_last_24h_sats: result.spent_last_24h_sats,
    }))
}

#[instrument(
    name = "api-keys.server.limits_remaining",
    skip_all,
    fields(api_key_id)
)]
async fn limits_remaining_handler(
    State(limits): State<Arc<Limits>>,
    Query(params): Query<LimitsRemainingQuery>,
) -> Result<Json<LimitsRemainingResponse>, (StatusCode, String)> {
    let api_key_id = params.api_key_id.parse::<IdentityApiKeyId>().map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Invalid API key ID: {}", e),
        )
    })?;

    let span = tracing::Span::current();
    span.record("api_key_id", &tracing::field::display(&api_key_id));

    let summary = limits
        .get_spending_summary(api_key_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Calculate remaining from limit and spent
    let remaining_sats = summary
        .daily_limit_sats
        .map(|limit| limit - summary.spent_last_24h_sats);

    Ok(Json(LimitsRemainingResponse {
        daily_limit_sats: summary.daily_limit_sats,
        spent_last_24h_sats: summary.spent_last_24h_sats,
        remaining_sats,
        transaction_count: summary.transaction_count_24h,
    }))
}

#[instrument(
    name = "api-keys.server.spending_record",
    skip_all,
    fields(api_key_id, amount_sats)
)]
async fn spending_record_handler(
    State(limits): State<Arc<Limits>>,
    Json(payload): Json<SpendingRecordRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let api_key_id = payload
        .api_key_id
        .parse::<IdentityApiKeyId>()
        .map_err(|e| {
            (
                StatusCode::BAD_REQUEST,
                format!("Invalid API key ID: {}", e),
            )
        })?;

    let span = tracing::Span::current();
    span.record("api_key_id", &tracing::field::display(&api_key_id));
    span.record("amount_sats", payload.amount_sats);

    limits
        .record_spending(api_key_id, payload.amount_sats, payload.transaction_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

/// Cleanup old transaction records periodically
/// Runs every 24 hours and deletes transactions older than 400 days (to support 365-day annual limits)
async fn cleanup_old_transactions_periodically(limits: Arc<Limits>) {
    let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(24 * 60 * 60)); // 24 hours
    loop {
        interval.tick().await;

        match limits.cleanup_old_transactions(400 * 24).await {
            Ok(count) => {
                tracing::info!(
                    deleted_rows = count,
                    "Successfully cleaned up old transaction records"
                );
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    "Failed to cleanup old transaction records"
                );
            }
        }
    }
}
