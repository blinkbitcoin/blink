use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::primitives::ReadPool;

#[derive(Debug, Clone, FromRow)]
pub struct MsgMessage {
    pub id: Uuid,
    pub username: String,
    pub status: String,
    pub sent_by: String,
    pub template_id: Option<Uuid>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct MsgMessageRepository {
    #[allow(dead_code)]
    pool: PgPool,
    read_pool: ReadPool,
}

impl MsgMessageRepository {
    pub fn new(pool: &PgPool, read_pool: &ReadPool) -> Self {
        Self {
            pool: pool.clone(),
            read_pool: read_pool.clone(),
        }
    }

    pub async fn create_message_in_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        username: String,
        status: String,
        sent_by: String,
        template_id: Uuid,
    ) -> Result<MsgMessage, sqlx::Error> {
        let message = sqlx::query_as::<_, MsgMessage>(
            r#"
            INSERT INTO msg_messages (username, status, sent_by, template_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, username, status, sent_by, template_id, updated_at
            "#,
        )
        .bind(username)
        .bind(status)
        .bind(sent_by)
        .bind(template_id)
        .fetch_one(&mut **tx)
        .await?;
        Ok(message)
    }

    pub async fn update_message_status_in_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        id: Uuid,
        status: String,
    ) -> Result<MsgMessage, sqlx::Error> {
        let message = sqlx::query_as::<_, MsgMessage>(
            r#"
            UPDATE msg_messages
            SET status = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, status, sent_by, template_id, updated_at
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(&mut **tx)
        .await?;
        Ok(message)
    }

    pub async fn list_messages(
        &self,
        username: Option<String>,
        status: Option<String>,
        updated_at_from: Option<DateTime<Utc>>,
        updated_at_to: Option<DateTime<Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MsgMessage>, sqlx::Error> {
        let messages = sqlx::query_as::<_, MsgMessage>(
            r#"
            SELECT id, username, status, sent_by, template_id, updated_at
            FROM msg_messages
            WHERE ($1::text IS NULL OR username = $1)
                AND ($2::text IS NULL OR status = $2)
                AND ($3::timestamptz IS NULL OR updated_at >= $3)
                AND ($4::timestamptz IS NULL OR updated_at <= $4)
            ORDER BY updated_at DESC
            LIMIT COALESCE($5, 9223372036854775807)
            OFFSET COALESCE($6, 0)
            "#,
        )
        .bind(username)
        .bind(status)
        .bind(updated_at_from)
        .bind(updated_at_to)
        .bind(limit)
        .bind(offset)
        .fetch_all(self.read_pool.inner())
        .await?;
        Ok(messages)
    }

    pub async fn count_messages(
        &self,
        username: Option<String>,
        status: Option<String>,
        updated_at_from: Option<DateTime<Utc>>,
        updated_at_to: Option<DateTime<Utc>>,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, (i64,)>(
            r#"
            SELECT COUNT(*)::bigint
            FROM msg_messages
            WHERE ($1::text IS NULL OR username = $1)
                AND ($2::text IS NULL OR status = $2)
                AND ($3::timestamptz IS NULL OR updated_at >= $3)
                AND ($4::timestamptz IS NULL OR updated_at <= $4)
            "#,
        )
        .bind(username)
        .bind(status)
        .bind(updated_at_from)
        .bind(updated_at_to)
        .fetch_one(self.read_pool.inner())
        .await?;
        Ok(row.0)
    }
}
