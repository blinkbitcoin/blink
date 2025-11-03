mod config;
mod server;

use crate::limits::Limits;
use std::sync::Arc;

pub use config::*;
pub use server::*;

pub async fn run_server(config: GrpcServerConfig, limits: Arc<Limits>) -> anyhow::Result<()> {
    server::start(config, limits).await?;
    Ok(())
}
