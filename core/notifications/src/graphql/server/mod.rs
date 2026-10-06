mod config;
mod jwks;

use async_graphql::*;
use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{routing::get, Extension, Router};
use serde::{Deserialize, Serialize};

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
    Claims(jwt_claims): Claims<JwtClaims>,
    req: GraphQLRequest,
) -> GraphQLResponse {
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

async fn playground() -> impl axum::response::IntoResponse {
    axum::response::Html(async_graphql::http::playground_source(
        async_graphql::http::GraphQLPlaygroundConfig::new("/graphql"),
    ))
}

pub const WRITE_SCOPE: &str = "write";

// Empty scope is trusted only for Kratos sessions.
pub fn can_write(scope: &str, session_id: &str) -> bool {
    scope.split(' ').any(|s| s == WRITE_SCOPE) || (scope.is_empty() && !session_id.is_empty())
}

#[cfg(test)]
mod tests {
    use super::can_write;

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
}
