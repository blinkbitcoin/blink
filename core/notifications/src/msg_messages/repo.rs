use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::primitives::ReadPool;

#[derive(Debug, Clone, FromRow)]
pub struct MsgMessage {
    pub id: Uuid,
    pub username: String,
    pub status: String,
    pub sent_by: String,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct MsgMessageRepository {
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

    pub async fn create_message(
        &self,
        username: String,
        status: String,
        sent_by: String,
    ) -> Result<MsgMessage, sqlx::Error> {
        let message = sqlx::query_as::<_, MsgMessage>(
            r#"
            INSERT INTO msg_messages (username, status, sent_by)
            VALUES ($1, $2, $3)
            RETURNING id, username, status, sent_by, updated_at
            "#,
        )
        .bind(username)
        .bind(status)
        .bind(sent_by)
        .fetch_one(&self.pool)
        .await?;
        Ok(message)
    }

    pub async fn update_message_status(
        &self,
        id: Uuid,
        status: String,
    ) -> Result<MsgMessage, sqlx::Error> {
        let message = sqlx::query_as::<_, MsgMessage>(
            r#"
            UPDATE msg_messages
            SET status = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, username, status, sent_by, updated_at
            "#,
        )
        .bind(id)
        .bind(status)
        .fetch_one(&self.pool)
        .await?;
        Ok(message)
    }

    pub async fn list_messages(
        &self,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MsgMessage>, sqlx::Error> {
        match (limit, offset) {
            (Some(limit), Some(offset)) => {
                let messages = sqlx::query_as::<_, MsgMessage>(
                    r#"
                    SELECT id, username, status, sent_by, updated_at
                    FROM msg_messages
                    ORDER BY updated_at DESC
                    LIMIT $1 OFFSET $2
                    "#,
                )
                .bind(limit)
                .bind(offset)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(messages)
            }
            (Some(limit), None) => {
                let messages = sqlx::query_as::<_, MsgMessage>(
                    r#"
                    SELECT id, username, status, sent_by, updated_at
                    FROM msg_messages
                    ORDER BY updated_at DESC
                    LIMIT $1
                    "#,
                )
                .bind(limit)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(messages)
            }
            (None, Some(offset)) => {
                let messages = sqlx::query_as::<_, MsgMessage>(
                    r#"
                    SELECT id, username, status, sent_by, updated_at
                    FROM msg_messages
                    ORDER BY updated_at DESC
                    OFFSET $1
                    "#,
                )
                .bind(offset)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(messages)
            }
            (None, None) => {
                let messages = sqlx::query_as::<_, MsgMessage>(
                    r#"
                    SELECT id, username, status, sent_by, updated_at
                    FROM msg_messages
                    ORDER BY updated_at DESC
                    "#,
                )
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(messages)
            }
        }
    }
}
