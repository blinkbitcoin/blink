mod config;
mod server;

use crate::app::ApiKeysApp;
use std::sync::Arc;

pub use config::*;
pub use server::*;

pub async fn run_server(config: GrpcServerConfig, app: Arc<ApiKeysApp>) -> anyhow::Result<()> {
    server::start(config, app).await?;
    Ok(())
}
