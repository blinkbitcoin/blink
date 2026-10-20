mod config;
mod jwks;

use async_graphql::*;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{routing::get, Extension, Router};
use axum_extra::headers::HeaderMap;
use serde::{Deserialize, Serialize};
use tracing::instrument;

use std::sync::Arc;

use crate::{app::NotificationsApp, graphql};

pub use config::*;
use jwks::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    sub: String,
    exp: u64,
    #[serde(default)]
    scope: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    client_id: String,
}

pub async fn run_server(
    config: ServerConfig,
    notifications_app: NotificationsApp,
) -> anyhow::Result<()> {
    let schema = graphql::schema(Some(notifications_app.clone()));

    let jwks_decoder = Arc::new(RemoteJwksDecoder::new(config.jwks_url.clone()));
    let decoder = jwks_decoder.clone();
    tokio::spawn(async move {
        decoder.refresh_keys_periodically().await;
    });

    let app = Router::new()
        .route(
            "/graphql",
            get(playground).post(axum::routing::post(graphql_handler)),
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

pub async fn graphql_handler(
    schema: Extension<Schema<graphql::Query, graphql::Mutation, EmptySubscription>>,
    headers: HeaderMap,
    Claims(jwt_claims): Claims<JwtClaims>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    if is_client_credentials_subject(&jwt_claims.sub, &jwt_claims.client_id) {
        return refuse_client_credentials_subject(&headers, &jwt_claims.client_id);
    }
    let req = req.into_inner();
    let can_write = can_write(&jwt_claims.scope, &jwt_claims.session_id);
    schema
        .execute(req.data(graphql::AuthSubject {
            id: jwt_claims.sub,
            can_write,
        }))
        .await
        .into()
}

#[instrument(
    name = "notifications.server.graphql.client_credentials_subject",
    skip_all,
    fields(client_id = %client_id, token.clientCredentialsSubject = true)
)]
fn refuse_client_credentials_subject(headers: &HeaderMap, client_id: &str) -> GraphQLResponse {
    tracing::http::extract_tracing(headers);
    tracing::warn!("client_credentials token used as user subject, refusing");
    async_graphql::Response::from_errors(vec![ServerError::new("Permission denied", None)]).into()
}

async fn playground() -> impl axum::response::IntoResponse {
    axum::response::Html(async_graphql::http::playground_source(
        async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
    ))
}

pub const WRITE_SCOPE: &str = "write";

pub fn can_write(scope: &str, session_id: &str) -> bool {
    scope.split(' ').any(|s| s == WRITE_SCOPE) || (scope.is_empty() && !session_id.is_empty())
}

/// client_credentials tokens carry `sub == client_id`: the subject is the client, not a user.
pub fn is_client_credentials_subject(sub: &str, client_id: &str) -> bool {
    !client_id.is_empty() && client_id == sub
}

#[cfg(test)]
mod tests {
    use super::{can_write, is_client_credentials_subject};

    #[test]
    fn empty_scope_needs_session() {
        assert!(can_write("", "session"));
        assert!(!can_write("", ""));
    }

    #[test]
    fn write_scope_allows_write() {
        assert!(can_write("read write", ""));
        assert!(!can_write("read", ""));
        assert!(!can_write("receive", ""));
    }

    #[test]
    fn client_credentials_subject_is_refused() {
        assert!(is_client_credentials_subject("client", "client"));
    }

    #[test]
    fn user_subjects_are_not_refused() {
        assert!(!is_client_credentials_subject("user-id", "app-client"));
        assert!(!is_client_credentials_subject("user-id", ""));
        assert!(!is_client_credentials_subject("", ""));
    }
}
