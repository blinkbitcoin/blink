mod error;

use sqlx::{Pool, Postgres};

use crate::identity::IdentityApiKeyId;

pub use error::*;

#[derive(Debug, Clone)]
pub struct LimitCheckResult {
    pub allowed: bool,
    pub daily_limit_sats: Option<i64>,
    pub weekly_limit_sats: Option<i64>,
    pub monthly_limit_sats: Option<i64>,
    pub annual_limit_sats: Option<i64>,
    pub daily_spent_sats: i64,
    pub weekly_spent_sats: i64,
    pub monthly_spent_sats: i64,
    pub annual_spent_sats: i64,
}

#[derive(Debug, Clone)]
pub struct SpendingSummary {
    pub daily_limit_sats: Option<i64>,
    pub weekly_limit_sats: Option<i64>,
    pub monthly_limit_sats: Option<i64>,
    pub annual_limit_sats: Option<i64>,
    pub daily_spent_sats: i64,
    pub weekly_spent_sats: i64,
    pub monthly_spent_sats: i64,
    pub annual_spent_sats: i64,
}

#[derive(Debug, Clone)]
struct AllLimits {
    daily_limit_sats: Option<i64>,
    weekly_limit_sats: Option<i64>,
    monthly_limit_sats: Option<i64>,
    annual_limit_sats: Option<i64>,
}

#[derive(Debug, Clone)]
struct AllSpending {
    daily_spent_sats: i64,
    weekly_spent_sats: i64,
    monthly_spent_sats: i64,
    annual_spent_sats: i64,
}

#[derive(Clone)]
pub struct Limits {
    pool: Pool<Postgres>,
}

impl Limits {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }

    pub async fn check_spending_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
    ) -> Result<LimitCheckResult, LimitError> {
        if amount_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        let limits = self.get_all_limits(api_key_id).await?;
        let spending = self.get_all_spending(api_key_id).await?;

        let allowed = [
            (limits.daily_limit_sats, spending.daily_spent_sats),
            (limits.weekly_limit_sats, spending.weekly_spent_sats),
            (limits.monthly_limit_sats, spending.monthly_spent_sats),
            (limits.annual_limit_sats, spending.annual_spent_sats),
        ]
        .iter()
        .all(|(limit, spent)| match limit {
            Some(limit) => spent.saturating_add(amount_sats) <= *limit,
            None => true,
        });

        Ok(LimitCheckResult {
            allowed,
            daily_limit_sats: limits.daily_limit_sats,
            weekly_limit_sats: limits.weekly_limit_sats,
            monthly_limit_sats: limits.monthly_limit_sats,
            annual_limit_sats: limits.annual_limit_sats,
            daily_spent_sats: spending.daily_spent_sats,
            weekly_spent_sats: spending.weekly_spent_sats,
            monthly_spent_sats: spending.monthly_spent_sats,
            annual_spent_sats: spending.annual_spent_sats,
        })
    }

    #[tracing::instrument(name = "limits.check_and_lock_spending", skip(self))]
    pub async fn check_and_lock_spending(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
    ) -> Result<String, LimitError> {
        if amount_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        let mut tx = self.pool.begin().await?;

        let limits = sqlx::query!(
            r#"
            SELECT daily_limit_sats, weekly_limit_sats, monthly_limit_sats, annual_limit_sats
            FROM api_key_limits
            WHERE api_key_id = $1
            FOR UPDATE
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .fetch_optional(&mut *tx)
        .await?;

        let (daily_limit, weekly_limit, monthly_limit, annual_limit) = match limits {
            Some(row) => (
                row.daily_limit_sats,
                row.weekly_limit_sats,
                row.monthly_limit_sats,
                row.annual_limit_sats,
            ),
            None => (None, None, None, None),
        };

        let spending = sqlx::query!(
            r#"
            SELECT
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::bigint AS "daily_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0)::bigint AS "weekly_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0)::bigint AS "monthly_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '365 days'), 0)::bigint AS "annual_spent_sats!"
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '365 days'
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .fetch_one(&mut *tx)
        .await?;

        let checks = [
            ("daily", daily_limit, spending.daily_spent_sats),
            ("weekly", weekly_limit, spending.weekly_spent_sats),
            ("monthly", monthly_limit, spending.monthly_spent_sats),
            ("annual", annual_limit, spending.annual_spent_sats),
        ];

        for (period, limit, spent) in &checks {
            if let Some(limit) = limit {
                if spent.saturating_add(amount_sats) > *limit {
                    tx.rollback().await?;
                    return Err(LimitError::LimitExceeded(period.to_string()));
                }
            }
        }

        let ephemeral_id = uuid::Uuid::new_v4().to_string();

        sqlx::query!(
            r#"
            INSERT INTO api_key_transactions (api_key_id, amount_sats, transaction_id, created_at)
            VALUES ($1, $2, $3, NOW())
            "#,
            api_key_id as IdentityApiKeyId,
            amount_sats,
            &ephemeral_id,
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(ephemeral_id)
    }

    #[tracing::instrument(name = "limits.record_spending", skip(self))]
    pub async fn record_spending(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
        transaction_id: Option<String>,
        ephemeral_id: Option<String>,
    ) -> Result<(), LimitError> {
        if amount_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        match ephemeral_id {
            Some(eid) => {
                let result = sqlx::query!(
                    r#"
                    UPDATE api_key_transactions
                    SET transaction_id = $1
                    WHERE transaction_id = $2
                      AND api_key_id = $3
                    "#,
                    transaction_id,
                    &eid,
                    api_key_id as IdentityApiKeyId,
                )
                .execute(&self.pool)
                .await?;

                if result.rows_affected() == 0 {
                    return Err(LimitError::EphemeralNotFound(eid));
                }
            }
            None => {
                sqlx::query!(
                    r#"
                    INSERT INTO api_key_transactions (api_key_id, amount_sats, transaction_id, created_at)
                    VALUES ($1, $2, $3, NOW())
                    ON CONFLICT (transaction_id) DO NOTHING
                    "#,
                    api_key_id as IdentityApiKeyId,
                    amount_sats,
                    transaction_id,
                )
                .execute(&self.pool)
                .await?;
            }
        }

        Ok(())
    }

    #[tracing::instrument(name = "limits.reverse_spending", skip(self))]
    pub async fn reverse_spending(&self, transaction_id: String) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            DELETE FROM api_key_transactions
            WHERE transaction_id = $1
            "#,
            &transaction_id,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.get_spending_summary", skip(self))]
    pub async fn get_spending_summary(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<SpendingSummary, LimitError> {
        let limits = self.get_all_limits(api_key_id).await?;
        let spending = self.get_all_spending(api_key_id).await?;

        Ok(SpendingSummary {
            daily_limit_sats: limits.daily_limit_sats,
            weekly_limit_sats: limits.weekly_limit_sats,
            monthly_limit_sats: limits.monthly_limit_sats,
            annual_limit_sats: limits.annual_limit_sats,
            daily_spent_sats: spending.daily_spent_sats,
            weekly_spent_sats: spending.weekly_spent_sats,
            monthly_spent_sats: spending.monthly_spent_sats,
            annual_spent_sats: spending.annual_spent_sats,
        })
    }

    #[tracing::instrument(name = "limits.set_daily_limit", skip(self))]
    pub async fn set_daily_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        daily_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if daily_limit_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        sqlx::query!(
            r#"
            INSERT INTO api_key_limits (api_key_id, daily_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET daily_limit_sats = $2
            "#,
            api_key_id as IdentityApiKeyId,
            daily_limit_sats,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.set_weekly_limit", skip(self))]
    pub async fn set_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        weekly_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if weekly_limit_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        sqlx::query!(
            r#"
            INSERT INTO api_key_limits (api_key_id, weekly_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET weekly_limit_sats = $2
            "#,
            api_key_id as IdentityApiKeyId,
            weekly_limit_sats,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.set_monthly_limit", skip(self))]
    pub async fn set_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        monthly_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if monthly_limit_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        sqlx::query!(
            r#"
            INSERT INTO api_key_limits (api_key_id, monthly_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET monthly_limit_sats = $2
            "#,
            api_key_id as IdentityApiKeyId,
            monthly_limit_sats,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.set_annual_limit", skip(self))]
    pub async fn set_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        annual_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if annual_limit_sats <= 0 {
            return Err(LimitError::InvalidLimitAmount);
        }

        sqlx::query!(
            r#"
            INSERT INTO api_key_limits (api_key_id, annual_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET annual_limit_sats = $2
            "#,
            api_key_id as IdentityApiKeyId,
            annual_limit_sats,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.remove_daily_limit", skip(self))]
    pub async fn remove_daily_limit(&self, api_key_id: IdentityApiKeyId) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            UPDATE api_key_limits
            SET daily_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.remove_weekly_limit", skip(self))]
    pub async fn remove_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            UPDATE api_key_limits
            SET weekly_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.remove_monthly_limit", skip(self))]
    pub async fn remove_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            UPDATE api_key_limits
            SET monthly_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.remove_annual_limit", skip(self))]
    pub async fn remove_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            UPDATE api_key_limits
            SET annual_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    #[tracing::instrument(name = "limits.remove_all_limits", skip(self))]
    pub async fn remove_all_limits(&self, api_key_id: IdentityApiKeyId) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            DELETE FROM api_key_limits
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn get_all_limits(&self, api_key_id: IdentityApiKeyId) -> Result<AllLimits, LimitError> {
        let row = sqlx::query!(
            r#"
            SELECT daily_limit_sats, weekly_limit_sats, monthly_limit_sats, annual_limit_sats
            FROM api_key_limits
            WHERE api_key_id = $1
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .fetch_optional(&self.pool)
        .await?;

        match row {
            Some(row) => Ok(AllLimits {
                daily_limit_sats: row.daily_limit_sats,
                weekly_limit_sats: row.weekly_limit_sats,
                monthly_limit_sats: row.monthly_limit_sats,
                annual_limit_sats: row.annual_limit_sats,
            }),
            None => Ok(AllLimits {
                daily_limit_sats: None,
                weekly_limit_sats: None,
                monthly_limit_sats: None,
                annual_limit_sats: None,
            }),
        }
    }

    async fn cleanup_empty_limits(&self, api_key_id: IdentityApiKeyId) -> Result<(), LimitError> {
        sqlx::query!(
            r#"
            DELETE FROM api_key_limits
            WHERE api_key_id = $1
              AND daily_limit_sats IS NULL
              AND weekly_limit_sats IS NULL
              AND monthly_limit_sats IS NULL
              AND annual_limit_sats IS NULL
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn get_all_spending(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<AllSpending, LimitError> {
        let row = sqlx::query!(
            r#"
            SELECT
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0)::bigint AS "daily_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '7 days'), 0)::bigint AS "weekly_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0)::bigint AS "monthly_spent_sats!",
                COALESCE(SUM(amount_sats) FILTER (WHERE created_at > NOW() - INTERVAL '365 days'), 0)::bigint AS "annual_spent_sats!"
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '365 days'
            "#,
            api_key_id as IdentityApiKeyId,
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(AllSpending {
            daily_spent_sats: row.daily_spent_sats,
            weekly_spent_sats: row.weekly_spent_sats,
            monthly_spent_sats: row.monthly_spent_sats,
            annual_spent_sats: row.annual_spent_sats,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_limits() -> Limits {
        // Lazy pool that never actually connects — validation errors fire before any SQL
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://localhost/nonexistent")
            .expect("connect_lazy should not fail");
        Limits::new(pool)
    }

    fn test_api_key_id() -> IdentityApiKeyId {
        IdentityApiKeyId::new()
    }

    #[tokio::test]
    async fn check_spending_limit_rejects_negative_amount() {
        let limits = test_limits();
        let result = limits.check_spending_limit(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn check_spending_limit_rejects_zero_amount() {
        let limits = test_limits();
        let result = limits.check_spending_limit(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn record_spending_rejects_zero_amount() {
        let limits = test_limits();
        let result = limits.record_spending(test_api_key_id(), 0, None, None).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn record_spending_rejects_negative_amount() {
        let limits = test_limits();
        let result = limits.record_spending(test_api_key_id(), -100, None, None).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_daily_limit_rejects_zero() {
        let limits = test_limits();
        let result = limits.set_daily_limit(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_daily_limit_rejects_negative() {
        let limits = test_limits();
        let result = limits.set_daily_limit(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_weekly_limit_rejects_zero() {
        let limits = test_limits();
        let result = limits.set_weekly_limit(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_weekly_limit_rejects_negative() {
        let limits = test_limits();
        let result = limits.set_weekly_limit(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_monthly_limit_rejects_zero() {
        let limits = test_limits();
        let result = limits.set_monthly_limit(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_monthly_limit_rejects_negative() {
        let limits = test_limits();
        let result = limits.set_monthly_limit(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_annual_limit_rejects_zero() {
        let limits = test_limits();
        let result = limits.set_annual_limit(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn set_annual_limit_rejects_negative() {
        let limits = test_limits();
        let result = limits.set_annual_limit(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn check_and_lock_spending_rejects_zero_amount() {
        let limits = test_limits();
        let result = limits.check_and_lock_spending(test_api_key_id(), 0).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }

    #[tokio::test]
    async fn check_and_lock_spending_rejects_negative_amount() {
        let limits = test_limits();
        let result = limits.check_and_lock_spending(test_api_key_id(), -1).await;
        assert!(matches!(result, Err(LimitError::InvalidLimitAmount)));
    }
}
