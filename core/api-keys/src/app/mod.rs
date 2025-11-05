mod config;
mod error;

use sqlx::{Pool, Postgres};

use crate::{identity::*, limits::*, scope::*};

pub use config::*;
pub use error::*;

#[derive(Clone)]
pub struct ApiKeysApp {
    _config: AppConfig,
    identities: Identities,
    limits: Limits,
    pool: Pool<Postgres>,
}

impl ApiKeysApp {
    pub fn new(pool: Pool<Postgres>, config: AppConfig) -> Self {
        Self {
            identities: Identities::new(
                pool.clone(),
                std::sync::Arc::new(format!("{}_", config.key_prefix)),
            ),
            limits: Limits::new(pool.clone()),
            _config: config,
            pool,
        }
    }

    #[tracing::instrument(name = "app.lookup_authenticated_subject", skip_all)]
    pub async fn lookup_authenticated_subject(
        &self,
        key: &str,
    ) -> Result<(IdentityApiKeyId, String, Vec<Scope>), ApplicationError> {
        Ok(self.identities.find_subject_by_key(key).await?)
    }

    #[tracing::instrument(name = "app.create_api_key_for_subject", skip_all)]
    pub async fn create_api_key_for_subject(
        &self,
        subject_id: &str,
        name: String,
        expire_in_days: Option<u16>,
        scopes: Vec<Scope>,
    ) -> Result<(IdentityApiKey, ApiKeySecret), ApplicationError> {
        if scopes.is_empty() {
            return Err(ApplicationError::MissingScopes);
        }

        let mut tx = self.pool.begin().await?;
        let id = self
            .identities
            .find_or_create_identity_for_subject_in_tx(&mut tx, subject_id)
            .await?;
        let expiry = expire_in_days.map(|days| {
            chrono::Utc::now() + std::time::Duration::from_secs(days as u64 * 24 * 60 * 60)
        });
        let key = self
            .identities
            .create_key_for_identity_in_tx(&mut tx, id, name, expiry, scopes)
            .await?;
        tx.commit().await?;
        Ok(key)
    }

    #[tracing::instrument(name = "app.list_api_keys_for_subject", skip_all)]
    pub async fn list_api_keys_for_subject(
        &self,
        subject_id: &str,
    ) -> Result<Vec<IdentityApiKey>, ApplicationError> {
        Ok(self.identities.list_keys_for_subject(subject_id).await?)
    }

    #[tracing::instrument(name = "app.revoke_api_key_for_subject", skip_all)]
    pub async fn revoke_api_key_for_subject(
        &self,
        subject: &str,
        key_id: IdentityApiKeyId,
    ) -> Result<IdentityApiKey, ApplicationError> {
        Ok(self.identities.revoke_api_key(subject, key_id).await?)
    }

    pub fn pool(&self) -> Pool<Postgres> {
        self.pool.clone()
    }

    #[tracing::instrument(name = "app.check_spending_limit", skip_all)]
    pub async fn check_spending_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
    ) -> Result<LimitCheckResult, ApplicationError> {
        Ok(self
            .limits
            .check_spending_limit(api_key_id, amount_sats)
            .await?)
    }

    #[tracing::instrument(name = "app.record_spending", skip_all)]
    pub async fn record_spending(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
        transaction_id: Option<String>,
    ) -> Result<(), ApplicationError> {
        Ok(self
            .limits
            .record_spending(api_key_id, amount_sats, transaction_id)
            .await?)
    }

    #[tracing::instrument(name = "app.get_spending_summary", skip_all)]
    pub async fn get_spending_summary(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<SpendingSummary, ApplicationError> {
        Ok(self.limits.get_spending_summary(api_key_id).await?)
    }

    #[tracing::instrument(name = "app.set_daily_limit", skip_all)]
    pub async fn set_daily_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        daily_limit_sats: i64,
    ) -> Result<(), ApplicationError> {
        Ok(self
            .limits
            .set_daily_limit(api_key_id, daily_limit_sats)
            .await?)
    }

    #[tracing::instrument(name = "app.set_weekly_limit", skip_all)]
    pub async fn set_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        weekly_limit_sats: i64,
    ) -> Result<(), ApplicationError> {
        Ok(self
            .limits
            .set_weekly_limit(api_key_id, weekly_limit_sats)
            .await?)
    }

    #[tracing::instrument(name = "app.set_monthly_limit", skip_all)]
    pub async fn set_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        monthly_limit_sats: i64,
    ) -> Result<(), ApplicationError> {
        Ok(self
            .limits
            .set_monthly_limit(api_key_id, monthly_limit_sats)
            .await?)
    }

    #[tracing::instrument(name = "app.set_annual_limit", skip_all)]
    pub async fn set_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        annual_limit_sats: i64,
    ) -> Result<(), ApplicationError> {
        Ok(self
            .limits
            .set_annual_limit(api_key_id, annual_limit_sats)
            .await?)
    }

    #[tracing::instrument(name = "app.remove_daily_limit", skip_all)]
    pub async fn remove_daily_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), ApplicationError> {
        Ok(self.limits.remove_daily_limit(api_key_id).await?)
    }

    #[tracing::instrument(name = "app.remove_weekly_limit", skip_all)]
    pub async fn remove_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), ApplicationError> {
        Ok(self.limits.remove_weekly_limit(api_key_id).await?)
    }

    #[tracing::instrument(name = "app.remove_monthly_limit", skip_all)]
    pub async fn remove_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), ApplicationError> {
        Ok(self.limits.remove_monthly_limit(api_key_id).await?)
    }

    #[tracing::instrument(name = "app.remove_annual_limit", skip_all)]
    pub async fn remove_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), ApplicationError> {
        Ok(self.limits.remove_annual_limit(api_key_id).await?)
    }

    #[tracing::instrument(name = "app.remove_all_limits", skip_all)]
    pub async fn remove_all_limits(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), ApplicationError> {
        Ok(self.limits.remove_all_limits(api_key_id).await?)
    }
}
