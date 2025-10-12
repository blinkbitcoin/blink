mod error;

use sqlx::{Pool, Postgres, Row};

use crate::identity::IdentityApiKeyId;

pub use error::*;

// No default limit - API keys without explicit limits are unlimited

#[derive(Debug, Clone)]
pub struct LimitCheckResult {
    pub allowed: bool,
    pub daily_limit_sats: Option<i64>,          // None if no limit configured
    pub weekly_limit_sats: Option<i64>,         // None if no limit configured
    pub monthly_limit_sats: Option<i64>,        // None if no limit configured
    pub annual_limit_sats: Option<i64>,         // None if no limit configured
    pub spent_last_24h_sats: i64,
    pub spent_last_7d_sats: i64,
    pub spent_last_30d_sats: i64,
    pub spent_last_365d_sats: i64,
}

#[derive(Debug, Clone)]
pub struct SpendingSummary {
    pub daily_limit_sats: Option<i64>,          // None if no limit configured
    pub weekly_limit_sats: Option<i64>,         // None if no limit configured
    pub monthly_limit_sats: Option<i64>,        // None if no limit configured
    pub annual_limit_sats: Option<i64>,         // None if no limit configured
    pub spent_last_24h_sats: i64,
    pub spent_last_7d_sats: i64,
    pub spent_last_30d_sats: i64,
    pub spent_last_365d_sats: i64,
    pub transaction_count_24h: i32,
    pub transaction_count_7d: i32,
    pub transaction_count_30d: i32,
    pub transaction_count_365d: i32,
}

#[derive(Debug, Clone)]
struct AllLimits {
    daily_limit_sats: Option<i64>,
    weekly_limit_sats: Option<i64>,
    monthly_limit_sats: Option<i64>,
    annual_limit_sats: Option<i64>,
}

pub struct Limits {
    pool: Pool<Postgres>,
}

impl Limits {
    pub fn new(pool: Pool<Postgres>) -> Self {
        Self { pool }
    }

    /// Check if a spending amount would exceed any configured limits
    /// If no limits are configured for the API key, returns allowed=true with all limits=None
    #[tracing::instrument(name = "limits.check_spending_limit", skip(self))]
    pub async fn check_spending_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
    ) -> Result<LimitCheckResult, LimitError> {
        if amount_sats < 0 {
            return Err(LimitError::NegativeAmount);
        }

        // Get all configured limits for this API key
        let limits = self.get_all_limits(api_key_id).await?;

        // If no limits configured, allow unlimited
        if limits.daily_limit_sats.is_none()
            && limits.weekly_limit_sats.is_none()
            && limits.monthly_limit_sats.is_none()
            && limits.annual_limit_sats.is_none()
        {
            return Ok(LimitCheckResult {
                allowed: true,
                daily_limit_sats: None,
                weekly_limit_sats: None,
                monthly_limit_sats: None,
                annual_limit_sats: None,
                spent_last_24h_sats: 0,
                spent_last_7d_sats: 0,
                spent_last_30d_sats: 0,
                spent_last_365d_sats: 0,
            });
        }

        // Calculate spent amounts for all windows
        let spent_24h = self.get_spending_last_24h(api_key_id).await?;
        let spent_7d = self.get_spending_last_7d(api_key_id).await?;
        let spent_30d = self.get_spending_last_30d(api_key_id).await?;
        let spent_365d = self.get_spending_last_365d(api_key_id).await?;

        // Check each configured limit
        let mut allowed = true;

        if let Some(limit) = limits.daily_limit_sats {
            if limit - spent_24h < amount_sats {
                allowed = false;
            }
        }

        if let Some(limit) = limits.weekly_limit_sats {
            if limit - spent_7d < amount_sats {
                allowed = false;
            }
        }

        if let Some(limit) = limits.monthly_limit_sats {
            if limit - spent_30d < amount_sats {
                allowed = false;
            }
        }

        if let Some(limit) = limits.annual_limit_sats {
            if limit - spent_365d < amount_sats {
                allowed = false;
            }
        }

        Ok(LimitCheckResult {
            allowed,
            daily_limit_sats: limits.daily_limit_sats,
            weekly_limit_sats: limits.weekly_limit_sats,
            monthly_limit_sats: limits.monthly_limit_sats,
            annual_limit_sats: limits.annual_limit_sats,
            spent_last_24h_sats: spent_24h,
            spent_last_7d_sats: spent_7d,
            spent_last_30d_sats: spent_30d,
            spent_last_365d_sats: spent_365d,
        })
    }

    /// Record a transaction for an API key
    /// Inserts a new record into api_key_transactions table
    #[tracing::instrument(name = "limits.record_spending", skip(self))]
    pub async fn record_spending(
        &self,
        api_key_id: IdentityApiKeyId,
        amount_sats: i64,
        transaction_id: Option<String>,
    ) -> Result<(), LimitError> {
        if amount_sats <= 0 {
            return Err(LimitError::NonPositiveAmount);
        }

        sqlx::query(
            r#"
            INSERT INTO api_key_transactions (api_key_id, amount_sats, transaction_id, created_at)
            VALUES ($1, $2, $3, NOW())
            "#,
        )
        .bind(api_key_id)
        .bind(amount_sats)
        .bind(transaction_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Get spending summary for an API key (for GraphQL queries)
    #[tracing::instrument(name = "limits.get_spending_summary", skip(self))]
    pub async fn get_spending_summary(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<SpendingSummary, LimitError> {
        let limits = self.get_all_limits(api_key_id).await?;
        let spent_24h = self.get_spending_last_24h(api_key_id).await?;
        let spent_7d = self.get_spending_last_7d(api_key_id).await?;
        let spent_30d = self.get_spending_last_30d(api_key_id).await?;
        let spent_365d = self.get_spending_last_365d(api_key_id).await?;

        let transaction_count_24h = self.get_transaction_count_last_24h(api_key_id).await?;
        let transaction_count_7d = self.get_transaction_count_last_7d(api_key_id).await?;
        let transaction_count_30d = self.get_transaction_count_last_30d(api_key_id).await?;
        let transaction_count_365d = self.get_transaction_count_last_365d(api_key_id).await?;

        Ok(SpendingSummary {
            daily_limit_sats: limits.daily_limit_sats,
            weekly_limit_sats: limits.weekly_limit_sats,
            monthly_limit_sats: limits.monthly_limit_sats,
            annual_limit_sats: limits.annual_limit_sats,
            spent_last_24h_sats: spent_24h,
            spent_last_7d_sats: spent_7d,
            spent_last_30d_sats: spent_30d,
            spent_last_365d_sats: spent_365d,
            transaction_count_24h,
            transaction_count_7d,
            transaction_count_30d,
            transaction_count_365d,
        })
    }

    /// Set a daily limit for an API key (in satoshis)
    #[tracing::instrument(name = "limits.set_daily_limit", skip(self))]
    pub async fn set_daily_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        daily_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if daily_limit_sats <= 0 {
            return Err(LimitError::InvalidLimit);
        }

        sqlx::query(
            r#"
            INSERT INTO api_key_limits (api_key_id, daily_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET daily_limit_sats = $2
            "#,
        )
        .bind(api_key_id)
        .bind(daily_limit_sats)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Set a weekly limit for an API key (in satoshis)
    #[tracing::instrument(name = "limits.set_weekly_limit", skip(self))]
    pub async fn set_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        weekly_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if weekly_limit_sats <= 0 {
            return Err(LimitError::InvalidLimit);
        }

        sqlx::query(
            r#"
            INSERT INTO api_key_limits (api_key_id, weekly_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET weekly_limit_sats = $2
            "#,
        )
        .bind(api_key_id)
        .bind(weekly_limit_sats)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Set a monthly limit for an API key (in satoshis)
    #[tracing::instrument(name = "limits.set_monthly_limit", skip(self))]
    pub async fn set_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        monthly_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if monthly_limit_sats <= 0 {
            return Err(LimitError::InvalidLimit);
        }

        sqlx::query(
            r#"
            INSERT INTO api_key_limits (api_key_id, monthly_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET monthly_limit_sats = $2
            "#,
        )
        .bind(api_key_id)
        .bind(monthly_limit_sats)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Set an annual limit for an API key (in satoshis)
    #[tracing::instrument(name = "limits.set_annual_limit", skip(self))]
    pub async fn set_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
        annual_limit_sats: i64,
    ) -> Result<(), LimitError> {
        if annual_limit_sats <= 0 {
            return Err(LimitError::InvalidLimit);
        }

        sqlx::query(
            r#"
            INSERT INTO api_key_limits (api_key_id, annual_limit_sats)
            VALUES ($1, $2)
            ON CONFLICT (api_key_id)
            DO UPDATE SET annual_limit_sats = $2
            "#,
        )
        .bind(api_key_id)
        .bind(annual_limit_sats)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Remove a daily limit for an API key
    #[tracing::instrument(name = "limits.remove_daily_limit", skip(self))]
    pub async fn remove_daily_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            UPDATE api_key_limits
            SET daily_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        // Delete the row if no limits remain
        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    /// Remove a weekly limit for an API key
    #[tracing::instrument(name = "limits.remove_weekly_limit", skip(self))]
    pub async fn remove_weekly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            UPDATE api_key_limits
            SET weekly_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        // Delete the row if no limits remain
        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    /// Remove a monthly limit for an API key
    #[tracing::instrument(name = "limits.remove_monthly_limit", skip(self))]
    pub async fn remove_monthly_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            UPDATE api_key_limits
            SET monthly_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        // Delete the row if no limits remain
        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    /// Remove an annual limit for an API key
    #[tracing::instrument(name = "limits.remove_annual_limit", skip(self))]
    pub async fn remove_annual_limit(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            UPDATE api_key_limits
            SET annual_limit_sats = NULL
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        // Delete the row if no limits remain
        self.cleanup_empty_limits(api_key_id).await?;

        Ok(())
    }

    /// Remove all limits for an API key (reverts to unlimited)
    #[tracing::instrument(name = "limits.remove_all_limits", skip(self))]
    pub async fn remove_all_limits(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            DELETE FROM api_key_limits
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Cleanup old transaction records (delete transactions older than specified hours)
    #[tracing::instrument(name = "limits.cleanup_old_transactions", skip(self))]
    pub async fn cleanup_old_transactions(&self, hours_to_keep: i32) -> Result<u64, LimitError> {
        let result = sqlx::query(
            r#"
            DELETE FROM api_key_transactions
            WHERE created_at < NOW() - ($1 || ' hours')::INTERVAL
            "#,
        )
        .bind(hours_to_keep)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    // Private helper methods

    /// Get all configured limits for an API key
    async fn get_all_limits(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<AllLimits, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT daily_limit_sats, weekly_limit_sats, monthly_limit_sats, annual_limit_sats
            FROM api_key_limits
            WHERE api_key_id = $1
            "#,
        )
        .bind(api_key_id)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(AllLimits {
                daily_limit_sats: row.get("daily_limit_sats"),
                weekly_limit_sats: row.get("weekly_limit_sats"),
                monthly_limit_sats: row.get("monthly_limit_sats"),
                annual_limit_sats: row.get("annual_limit_sats"),
            })
        } else {
            Ok(AllLimits {
                daily_limit_sats: None,
                weekly_limit_sats: None,
                monthly_limit_sats: None,
                annual_limit_sats: None,
            })
        }
    }

    /// Delete limit row if all limits are NULL
    async fn cleanup_empty_limits(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<(), LimitError> {
        sqlx::query(
            r#"
            DELETE FROM api_key_limits
            WHERE api_key_id = $1
              AND daily_limit_sats IS NULL
              AND weekly_limit_sats IS NULL
              AND monthly_limit_sats IS NULL
              AND annual_limit_sats IS NULL
            "#,
        )
        .bind(api_key_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Calculate total spending in the last 24 hours (rolling window)
    async fn get_spending_last_24h(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i64, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COALESCE(SUM(amount_sats), 0)::bigint as spent
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '24 hours'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("spent"))
    }

    /// Calculate total spending in the last 7 days (rolling window)
    async fn get_spending_last_7d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i64, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COALESCE(SUM(amount_sats), 0)::bigint as spent
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '7 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("spent"))
    }

    /// Calculate total spending in the last 30 days (rolling window)
    async fn get_spending_last_30d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i64, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COALESCE(SUM(amount_sats), 0)::bigint as spent
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '30 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("spent"))
    }

    /// Calculate total spending in the last 365 days (rolling window)
    async fn get_spending_last_365d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i64, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COALESCE(SUM(amount_sats), 0)::bigint as spent
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '365 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("spent"))
    }

    /// Get transaction count in the last 24 hours
    async fn get_transaction_count_last_24h(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i32, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*)::int as count
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '24 hours'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("count"))
    }

    /// Get transaction count in the last 7 days
    async fn get_transaction_count_last_7d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i32, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*)::int as count
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '7 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("count"))
    }

    /// Get transaction count in the last 30 days
    async fn get_transaction_count_last_30d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i32, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*)::int as count
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '30 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("count"))
    }

    /// Get transaction count in the last 365 days
    async fn get_transaction_count_last_365d(
        &self,
        api_key_id: IdentityApiKeyId,
    ) -> Result<i32, LimitError> {
        let row = sqlx::query(
            r#"
            SELECT COUNT(*)::int as count
            FROM api_key_transactions
            WHERE api_key_id = $1
              AND created_at > NOW() - INTERVAL '365 days'
            "#,
        )
        .bind(api_key_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(row.get("count"))
    }
}
