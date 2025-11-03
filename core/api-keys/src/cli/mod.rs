pub mod config;
mod db;

use clap::Parser;
use std::path::PathBuf;

use self::config::{Config, EnvOverride};

#[derive(Parser)]
#[clap(long_about = None)]
struct Cli {
    #[clap(
        short,
        long,
        env = "API_KEYS_CONFIG",
        default_value = "api-keys.yml",
        value_name = "FILE"
    )]
    config: PathBuf,
    #[clap(env = "PG_CON")]
    pg_con: String,
}

pub async fn run() -> anyhow::Result<()> {
    let cli = Cli::parse();

    let config = Config::from_path(cli.config, EnvOverride { db_con: cli.pg_con })?;

    run_cmd(config).await?;

    Ok(())
}

async fn run_cmd(config: Config) -> anyhow::Result<()> {
    use anyhow::Context;

    tracing::init_tracer(config.tracing)?;
    let pool = db::init_pool(&config.db).await?;
    let app = crate::app::ApiKeysApp::new(pool.clone(), config.app);
    let limits = std::sync::Arc::new(crate::limits::Limits::new(pool));

    let (send, mut receive) = tokio::sync::mpsc::channel(1);
    let mut handles = vec![];

    let http_send = send.clone();
    let http_config = config.server;
    let http_app = app.clone();
    handles.push(tokio::spawn(async move {
        let _ = http_send.try_send(
            crate::server::run_server(http_config, http_app)
                .await
                .context("http server error"),
        );
    }));

    let grpc_send = send.clone();
    let grpc_config = config.grpc_server;
    handles.push(tokio::spawn(async move {
        let _ = grpc_send.try_send(
            crate::grpc::run_server(grpc_config, limits)
                .await
                .context("grpc server error"),
        );
    }));

    let reason = receive.recv().await.expect("Didn't receive msg");
    for handle in handles {
        handle.abort();
    }

    reason
}
