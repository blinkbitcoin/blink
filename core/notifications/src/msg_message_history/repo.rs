use chrono::{DateTime, Utc};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::primitives::ReadPool;

#[derive(Debug, Clone, FromRow)]
pub struct MsgMessageHistory {
    pub id: Uuid,
    pub msg_message_id: Uuid,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct MsgMessageHistoryRepository {
    read_pool: ReadPool,
}

impl MsgMessageHistoryRepository {
    pub fn new(_pool: &PgPool, read_pool: &ReadPool) -> Self {
        Self {
            read_pool: read_pool.clone(),
        }
    }

    pub async fn create_history_in_tx(
        &self,
        tx: &mut Transaction<'_, Postgres>,
        msg_message_id: Uuid,
        status: String,
    ) -> Result<MsgMessageHistory, sqlx::Error> {
        let history = sqlx::query_as::<_, MsgMessageHistory>(
            r#"
            INSERT INTO msg_message_history (msg_message_id, status)
            VALUES ($1, $2)
            RETURNING id, msg_message_id, status, created_at
            "#,
        )
        .bind(msg_message_id)
        .bind(status)
        .fetch_one(&mut **tx)
        .await?;
        Ok(history)
    }

    pub async fn list_history_by_message_id(
        &self,
        msg_message_id: Uuid,
    ) -> Result<Vec<MsgMessageHistory>, sqlx::Error> {
        let rows = sqlx::query_as::<_, MsgMessageHistory>(
            r#"
            SELECT id, msg_message_id, status, created_at
            FROM msg_message_history
            WHERE msg_message_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(msg_message_id)
        .fetch_all(self.read_pool.inner())
        .await?;
        Ok(rows)
    }
}
