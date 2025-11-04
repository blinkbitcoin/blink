#![allow(clippy::blocks_in_conditions)]

#[allow(clippy::all)]
pub mod proto {
    tonic::include_proto!("services.api_keys.v1");
}

use tonic::{transport::Server, Request, Response, Status};
use tracing::{grpc, instrument};

use self::proto::{api_keys_service_server::ApiKeysService, *};

use super::config::*;
use crate::{identity::IdentityApiKeyId, limits::Limits};
use std::sync::Arc;

pub struct ApiKeys {
    limits: Arc<Limits>,
}

#[tonic::async_trait]
impl ApiKeysService for ApiKeys {
    #[instrument(name = "api_keys.check_spending_limit", skip_all, err)]
    async fn check_spending_limit(
        &self,
        request: Request<CheckSpendingLimitRequest>,
    ) -> Result<Response<CheckSpendingLimitResponse>, Status> {
        grpc::extract_tracing(&request);
        let request = request.into_inner();
        let CheckSpendingLimitRequest {
            api_key_id,
            amount_sats,
        } = request;

        let api_key_id = api_key_id
            .parse::<IdentityApiKeyId>()
            .map_err(|e| Status::invalid_argument(format!("Invalid API key ID: {}", e)))?;

        let result = self
            .limits
            .check_spending_limit(api_key_id, amount_sats)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let remaining_daily_sats = result
            .daily_limit_sats
            .map(|limit| limit - result.spent_last_24h_sats);
        let remaining_weekly_sats = result
            .weekly_limit_sats
            .map(|limit| limit - result.spent_last_7d_sats);
        let remaining_monthly_sats = result
            .monthly_limit_sats
            .map(|limit| limit - result.spent_last_30d_sats);
        let remaining_annual_sats = result
            .annual_limit_sats
            .map(|limit| limit - result.spent_last_365d_sats);

        Ok(Response::new(CheckSpendingLimitResponse {
            allowed: result.allowed,
            daily_limit_sats: result.daily_limit_sats,
            weekly_limit_sats: result.weekly_limit_sats,
            monthly_limit_sats: result.monthly_limit_sats,
            annual_limit_sats: result.annual_limit_sats,
            spent_last_24h_sats: result.spent_last_24h_sats,
            spent_last_7d_sats: result.spent_last_7d_sats,
            spent_last_30d_sats: result.spent_last_30d_sats,
            spent_last_365d_sats: result.spent_last_365d_sats,
            remaining_daily_sats,
            remaining_weekly_sats,
            remaining_monthly_sats,
            remaining_annual_sats,
        }))
    }

    #[instrument(name = "api_keys.get_spending_summary", skip_all, err)]
    async fn get_spending_summary(
        &self,
        request: Request<GetSpendingSummaryRequest>,
    ) -> Result<Response<GetSpendingSummaryResponse>, Status> {
        grpc::extract_tracing(&request);
        let request = request.into_inner();
        let GetSpendingSummaryRequest { api_key_id } = request;

        let api_key_id = api_key_id
            .parse::<IdentityApiKeyId>()
            .map_err(|e| Status::invalid_argument(format!("Invalid API key ID: {}", e)))?;

        let summary = self
            .limits
            .get_spending_summary(api_key_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let remaining_daily_sats = summary
            .daily_limit_sats
            .map(|limit| limit - summary.spent_last_24h_sats);
        let remaining_weekly_sats = summary
            .weekly_limit_sats
            .map(|limit| limit - summary.spent_last_7d_sats);
        let remaining_monthly_sats = summary
            .monthly_limit_sats
            .map(|limit| limit - summary.spent_last_30d_sats);
        let remaining_annual_sats = summary
            .annual_limit_sats
            .map(|limit| limit - summary.spent_last_365d_sats);

        Ok(Response::new(GetSpendingSummaryResponse {
            daily_limit_sats: summary.daily_limit_sats,
            weekly_limit_sats: summary.weekly_limit_sats,
            monthly_limit_sats: summary.monthly_limit_sats,
            annual_limit_sats: summary.annual_limit_sats,
            spent_last_24h_sats: summary.spent_last_24h_sats,
            spent_last_7d_sats: summary.spent_last_7d_sats,
            spent_last_30d_sats: summary.spent_last_30d_sats,
            spent_last_365d_sats: summary.spent_last_365d_sats,
            remaining_daily_sats,
            remaining_weekly_sats,
            remaining_monthly_sats,
            remaining_annual_sats,
        }))
    }

    #[instrument(name = "api_keys.record_spending", skip_all, err)]
    async fn record_spending(
        &self,
        request: Request<RecordSpendingRequest>,
    ) -> Result<Response<RecordSpendingResponse>, Status> {
        grpc::extract_tracing(&request);
        let request = request.into_inner();
        let RecordSpendingRequest {
            api_key_id,
            amount_sats,
            transaction_id,
        } = request;

        let api_key_id = api_key_id
            .parse::<IdentityApiKeyId>()
            .map_err(|e| Status::invalid_argument(format!("Invalid API key ID: {}", e)))?;

        self.limits
            .record_spending(api_key_id, amount_sats, transaction_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(RecordSpendingResponse {}))
    }
}

pub(crate) async fn start(
    server_config: GrpcServerConfig,
    limits: Arc<Limits>,
) -> Result<(), tonic::transport::Error> {
    use proto::api_keys_service_server::ApiKeysServiceServer;

    let api_keys = ApiKeys { limits };
    println!("Starting grpc server on port {}", server_config.port);
    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<ApiKeysServiceServer<ApiKeys>>()
        .await;
    Server::builder()
        .add_service(health_service)
        .add_service(ApiKeysServiceServer::new(api_keys))
        .serve(([0, 0, 0, 0], server_config.port).into())
        .await?;
    Ok(())
}
