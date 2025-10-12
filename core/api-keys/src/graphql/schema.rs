use async_graphql::*;
use chrono::{DateTime, TimeZone, Utc};

use crate::{app::ApiKeysApp, identity::IdentityApiKeyId, limits::Limits, scope::*};

pub struct AuthSubject {
    pub id: String,
    pub can_write: bool,
}

#[derive(Clone, Copy)]
pub struct Timestamp(DateTime<Utc>);
impl From<DateTime<Utc>> for Timestamp {
    fn from(dt: DateTime<Utc>) -> Self {
        Timestamp(dt)
    }
}
impl From<Timestamp> for DateTime<Utc> {
    fn from(Timestamp(dt): Timestamp) -> Self {
        dt
    }
}

#[Scalar(name = "Timestamp")]
impl ScalarType for Timestamp {
    fn parse(value: async_graphql::Value) -> async_graphql::InputValueResult<Self> {
        let epoch = match &value {
            async_graphql::Value::Number(n) => n
                .as_i64()
                .ok_or_else(|| async_graphql::InputValueError::expected_type(value)),
            _ => Err(async_graphql::InputValueError::expected_type(value)),
        }?;

        Utc.timestamp_opt(epoch, 0)
            .single()
            .map(Timestamp)
            .ok_or_else(|| async_graphql::InputValueError::custom("Invalid timestamp"))
    }

    fn to_value(&self) -> async_graphql::Value {
        async_graphql::Value::Number(self.0.timestamp().into())
    }
}

pub struct Query;

#[Object]
impl Query {
    #[graphql(entity)]
    async fn me(&self, id: ID) -> Option<User> {
        Some(User { id })
    }
}

#[derive(SimpleObject)]
#[graphql(complex)]
pub(super) struct ApiKey {
    pub id: ID,
    pub name: String,
    pub created_at: Timestamp,
    pub revoked: bool,
    pub expired: bool,
    pub last_used_at: Option<Timestamp>,
    pub expires_at: Option<Timestamp>,
    pub read_only: bool,
    pub scopes: Vec<Scope>,
}

#[ComplexObject]
impl ApiKey {
    /// Daily spending limit in satoshis (rolling 24h window). Returns null if no limit is set.
    async fn daily_limit_sats(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.daily_limit_sats)
    }

    /// Weekly spending limit in satoshis (rolling 7 days). Returns null if no limit is set.
    async fn weekly_limit_sats(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.weekly_limit_sats)
    }

    /// Monthly spending limit in satoshis (rolling 30 days). Returns null if no limit is set.
    async fn monthly_limit_sats(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.monthly_limit_sats)
    }

    /// Annual spending limit in satoshis (rolling 365 days). Returns null if no limit is set.
    async fn annual_limit_sats(&self, ctx: &Context<'_>) -> Result<Option<i64>> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.annual_limit_sats)
    }

    /// Amount spent in the last 24 hours (rolling window) in satoshis
    async fn spent_last_24h_sats(&self, ctx: &Context<'_>) -> Result<i64> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.spent_last_24h_sats)
    }

    /// Amount spent in the last 7 days (rolling window) in satoshis
    async fn spent_last_7d_sats(&self, ctx: &Context<'_>) -> Result<i64> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.spent_last_7d_sats)
    }

    /// Amount spent in the last 30 days (rolling window) in satoshis
    async fn spent_last_30d_sats(&self, ctx: &Context<'_>) -> Result<i64> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.spent_last_30d_sats)
    }

    /// Amount spent in the last 365 days (rolling window) in satoshis
    async fn spent_last_365d_sats(&self, ctx: &Context<'_>) -> Result<i64> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let limits = Limits::new(app.pool());
        let api_key_id = self.id.parse::<IdentityApiKeyId>()?;

        let summary = limits.get_spending_summary(api_key_id).await?;
        Ok(summary.spent_last_365d_sats)
    }
}

#[derive(SimpleObject)]
#[graphql(extends)]
#[graphql(complex)]
struct User {
    #[graphql(external)]
    id: ID,
}

#[ComplexObject]
impl User {
    async fn api_keys(&self, ctx: &Context<'_>) -> Result<Vec<ApiKey>> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;

        let identity_api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_keys = identity_api_keys.into_iter().map(ApiKey::from).collect();

        Ok(api_keys)
    }
}

#[derive(SimpleObject)]
pub(super) struct ApiKeyCreatePayload {
    pub api_key: ApiKey,
    pub api_key_secret: String,
}

#[derive(SimpleObject)]
pub(super) struct ApiKeyRevokePayload {
    pub api_key: ApiKey,
}

pub struct Mutation;

#[derive(InputObject)]
struct ApiKeyCreateInput {
    name: String,
    expire_in_days: Option<u16>,
    #[graphql(default_with = "default_scopes()")]
    scopes: Vec<Scope>,
}

fn default_scopes() -> Vec<Scope> {
    vec![Scope::Read, Scope::Write]
}

#[derive(InputObject)]
struct ApiKeyRevokeInput {
    id: ID,
}

#[derive(InputObject)]
struct ApiKeySetDailyLimitInput {
    id: ID,
    daily_limit_sats: i64,
}

#[derive(InputObject)]
struct ApiKeySetWeeklyLimitInput {
    id: ID,
    weekly_limit_sats: i64,
}

#[derive(InputObject)]
struct ApiKeySetMonthlyLimitInput {
    id: ID,
    monthly_limit_sats: i64,
}

#[derive(InputObject)]
struct ApiKeySetAnnualLimitInput {
    id: ID,
    annual_limit_sats: i64,
}

#[derive(SimpleObject)]
pub(super) struct ApiKeySetLimitPayload {
    pub api_key: ApiKey,
}

#[derive(InputObject)]
struct ApiKeyRemoveLimitInput {
    id: ID,
}

#[Object]
impl Mutation {
    async fn api_key_create(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyCreateInput,
    ) -> async_graphql::Result<ApiKeyCreatePayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }
        let key = app
            .create_api_key_for_subject(&subject.id, input.name, input.expire_in_days, input.scopes)
            .await?;
        Ok(ApiKeyCreatePayload::from(key))
    }

    async fn api_key_revoke(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyRevokeInput,
    ) -> async_graphql::Result<ApiKeyRevokePayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let subject = ctx.data::<AuthSubject>()?;
        let api_key = app
            .revoke_api_key_for_subject(&subject.id, api_key_id)
            .await?;
        Ok(ApiKeyRevokePayload::from(api_key))
    }

    async fn api_key_set_daily_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeySetDailyLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        // Verify the API key belongs to the subject
        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits
            .set_daily_limit(api_key_id, input.daily_limit_sats)
            .await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_set_weekly_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeySetWeeklyLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits
            .set_weekly_limit(api_key_id, input.weekly_limit_sats)
            .await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_set_monthly_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeySetMonthlyLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits
            .set_monthly_limit(api_key_id, input.monthly_limit_sats)
            .await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_set_annual_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeySetAnnualLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits
            .set_annual_limit(api_key_id, input.annual_limit_sats)
            .await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_remove_daily_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyRemoveLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits.remove_daily_limit(api_key_id).await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_remove_weekly_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyRemoveLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits.remove_weekly_limit(api_key_id).await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_remove_monthly_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyRemoveLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits.remove_monthly_limit(api_key_id).await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }

    async fn api_key_remove_annual_limit(
        &self,
        ctx: &Context<'_>,
        input: ApiKeyRemoveLimitInput,
    ) -> async_graphql::Result<ApiKeySetLimitPayload> {
        let app = ctx.data_unchecked::<ApiKeysApp>();
        let subject = ctx.data::<AuthSubject>()?;
        if !subject.can_write {
            return Err("Permission denied".into());
        }

        let api_key_id = input.id.parse::<IdentityApiKeyId>()?;
        let limits = Limits::new(app.pool());

        let api_keys = app.list_api_keys_for_subject(&subject.id).await?;
        let api_key = api_keys
            .into_iter()
            .find(|k| k.id == api_key_id)
            .ok_or("API key not found")?;

        limits.remove_annual_limit(api_key_id).await?;

        Ok(ApiKeySetLimitPayload {
            api_key: ApiKey::from(api_key),
        })
    }
}
