#![allow(clippy::blocks_in_conditions)]

#[allow(clippy::all)]
pub mod proto {
    tonic::include_proto!("services.api_keys.v1");
}

use tonic::{transport::Server, Request, Response, Status};
use tracing::{grpc, instrument};

use self::proto::{api_keys_service_server::ApiKeysService, *};

use super::config::*;
use crate::{app::{ApiKeysApp, ApplicationError}, identity::IdentityApiKeyId, limits::LimitError};
use std::sync::Arc;

pub struct ApiKeys {
    app: Arc<ApiKeysApp>,
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
            .app
            .check_spending_limit(api_key_id, amount_sats)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let remaining_daily_sats = result
            .daily_limit_sats
            .map(|limit| limit.saturating_sub(result.daily_spent_sats).max(0));
        let remaining_weekly_sats = result
            .weekly_limit_sats
            .map(|limit| limit.saturating_sub(result.weekly_spent_sats).max(0));
        let remaining_monthly_sats = result
            .monthly_limit_sats
            .map(|limit| limit.saturating_sub(result.monthly_spent_sats).max(0));
        let remaining_annual_sats = result
            .annual_limit_sats
            .map(|limit| limit.saturating_sub(result.annual_spent_sats).max(0));

        Ok(Response::new(CheckSpendingLimitResponse {
            allowed: result.allowed,
            daily_limit_sats: result.daily_limit_sats,
            weekly_limit_sats: result.weekly_limit_sats,
            monthly_limit_sats: result.monthly_limit_sats,
            annual_limit_sats: result.annual_limit_sats,
            daily_spent_sats: result.daily_spent_sats,
            weekly_spent_sats: result.weekly_spent_sats,
            monthly_spent_sats: result.monthly_spent_sats,
            annual_spent_sats: result.annual_spent_sats,
            remaining_daily_sats,
            remaining_weekly_sats,
            remaining_monthly_sats,
            remaining_annual_sats,
        }))
    }

    #[instrument(name = "api_keys.check_and_lock_spending", skip_all, err)]
    async fn check_and_lock_spending(
        &self,
        request: Request<CheckAndLockSpendingRequest>,
    ) -> Result<Response<CheckAndLockSpendingResponse>, Status> {
        grpc::extract_tracing(&request);
        let request = request.into_inner();
        let CheckAndLockSpendingRequest {
            api_key_id,
            amount_sats,
        } = request;

        let api_key_id = api_key_id
            .parse::<IdentityApiKeyId>()
            .map_err(|e| Status::invalid_argument(format!("Invalid API key ID: {}", e)))?;

        let ephemeral_id = self
            .app
            .check_and_lock_spending(api_key_id, amount_sats)
            .await
            .map_err(|e| match &e {
                ApplicationError::Limit(LimitError::LimitExceeded(_)) => {
                    Status::failed_precondition(e.to_string())
                }
                ApplicationError::Limit(LimitError::InvalidLimitAmount) => {
                    Status::invalid_argument(e.to_string())
                }
                _ => Status::internal(e.to_string()),
            })?;

        Ok(Response::new(CheckAndLockSpendingResponse { ephemeral_id }))
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
            .app
            .get_spending_summary(api_key_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let remaining_daily_sats = summary
            .daily_limit_sats
            .map(|limit| limit.saturating_sub(summary.daily_spent_sats).max(0));
        let remaining_weekly_sats = summary
            .weekly_limit_sats
            .map(|limit| limit.saturating_sub(summary.weekly_spent_sats).max(0));
        let remaining_monthly_sats = summary
            .monthly_limit_sats
            .map(|limit| limit.saturating_sub(summary.monthly_spent_sats).max(0));
        let remaining_annual_sats = summary
            .annual_limit_sats
            .map(|limit| limit.saturating_sub(summary.annual_spent_sats).max(0));

        Ok(Response::new(GetSpendingSummaryResponse {
            daily_limit_sats: summary.daily_limit_sats,
            weekly_limit_sats: summary.weekly_limit_sats,
            monthly_limit_sats: summary.monthly_limit_sats,
            annual_limit_sats: summary.annual_limit_sats,
            daily_spent_sats: summary.daily_spent_sats,
            weekly_spent_sats: summary.weekly_spent_sats,
            monthly_spent_sats: summary.monthly_spent_sats,
            annual_spent_sats: summary.annual_spent_sats,
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
            ephemeral_id,
        } = request;

        let api_key_id = api_key_id
            .parse::<IdentityApiKeyId>()
            .map_err(|e| Status::invalid_argument(format!("Invalid API key ID: {}", e)))?;

        self.app
            .record_spending(api_key_id, amount_sats, transaction_id, ephemeral_id)
            .await
            .map_err(|e| match &e {
                ApplicationError::Limit(LimitError::InvalidLimitAmount) |
                ApplicationError::Limit(LimitError::MissingTransactionId) => {
                    Status::invalid_argument(e.to_string())
                }
                ApplicationError::Limit(LimitError::EphemeralNotFound(_)) => {
                    Status::not_found(e.to_string())
                }
                _ => Status::internal(e.to_string()),
            })?;

        Ok(Response::new(RecordSpendingResponse {}))
    }

    #[instrument(name = "api_keys.reverse_spending", skip_all, err)]
    async fn reverse_spending(
        &self,
        request: Request<ReverseSpendingRequest>,
    ) -> Result<Response<ReverseSpendingResponse>, Status> {
        grpc::extract_tracing(&request);
        let request = request.into_inner();
        let ReverseSpendingRequest { transaction_id } = request;

        if transaction_id.is_empty() {
            return Err(Status::invalid_argument("Transaction ID is required"));
        }

        self.app
            .reverse_spending(transaction_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ReverseSpendingResponse {}))
    }
}

pub(crate) async fn start(
    server_config: GrpcServerConfig,
    app: Arc<ApiKeysApp>,
) -> Result<(), tonic::transport::Error> {
    use proto::api_keys_service_server::ApiKeysServiceServer;

    let api_keys = ApiKeys { app };
    tracing::info!("Starting grpc server on port {}", server_config.port);
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
