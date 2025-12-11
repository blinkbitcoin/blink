use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::primitives::ReadPool;

#[derive(Debug, Clone, FromRow)]
pub struct MsgTemplate {
    pub id: Uuid,
    pub name: String,
    pub language_code: String,
    pub icon_name: String,
    pub title: String,
    pub body: String,
    pub should_send_push: bool,
    pub should_add_to_history: bool,
    pub should_add_to_bulletin: bool,
}

#[derive(Debug, Clone)]
pub struct MsgTemplateRepository {
    pool: PgPool,
    read_pool: ReadPool,
}

impl MsgTemplateRepository {
    pub fn new(pool: &PgPool, read_pool: &ReadPool) -> Self {
        Self {
            pool: pool.clone(),
            read_pool: read_pool.clone(),
        }
    }

    pub async fn create_template(
        &self,
        name: String,
        language_code: String,
        icon_name: String,
        title: String,
        body: String,
        should_send_push: bool,
        should_add_to_history: bool,
        should_add_to_bulletin: bool,
    ) -> Result<MsgTemplate, sqlx::Error> {
        let template = sqlx::query_as::<_, MsgTemplate>(
            r#"
            INSERT INTO msg_templates (
                name,
                language_code,
                icon_name,
                title,
                body,
                should_send_push,
                should_add_to_history,
                should_add_to_bulletin
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                id,
                name,
                language_code,
                icon_name,
                title,
                body,
                should_send_push,
                should_add_to_history,
                should_add_to_bulletin
            "#,
        )
        .bind(name)
        .bind(language_code)
        .bind(icon_name)
        .bind(title)
        .bind(body)
        .bind(should_send_push)
        .bind(should_add_to_history)
        .bind(should_add_to_bulletin)
        .fetch_one(&self.pool)
        .await?;
        Ok(template)
    }

    pub async fn update_template(
        &self,
        id: Uuid,
        name: String,
        language_code: String,
        icon_name: String,
        title: String,
        body: String,
        should_send_push: bool,
        should_add_to_history: bool,
        should_add_to_bulletin: bool,
    ) -> Result<MsgTemplate, sqlx::Error> {
        let template = sqlx::query_as::<_, MsgTemplate>(
            r#"
            UPDATE msg_templates
            SET name = $2,
                language_code = $3,
                icon_name = $4,
                title = $5,
                body = $6,
                should_send_push = $7,
                should_add_to_history = $8,
                should_add_to_bulletin = $9
            WHERE id = $1
            RETURNING
                id,
                name,
                language_code,
                icon_name,
                title,
                body,
                should_send_push,
                should_add_to_history,
                should_add_to_bulletin
            "#,
        )
        .bind(id)
        .bind(name)
        .bind(language_code)
        .bind(icon_name)
        .bind(title)
        .bind(body)
        .bind(should_send_push)
        .bind(should_add_to_history)
        .bind(should_add_to_bulletin)
        .fetch_one(&self.pool)
        .await?;
        Ok(template)
    }

    pub async fn delete_template(&self, id: Uuid) -> Result<Uuid, sqlx::Error> {
        let row = sqlx::query_as::<_, (Uuid,)>(
            r#"
            DELETE FROM msg_templates
            WHERE id = $1
            RETURNING id
            "#,
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        Ok(row.0)
    }

    pub async fn list_templates(
        &self,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MsgTemplate>, sqlx::Error> {
        match (limit, offset) {
            (Some(limit), Some(offset)) => {
                let templates = sqlx::query_as::<_, MsgTemplate>(
                    r#"
                    SELECT
                        id,
                        name,
                        language_code,
                        icon_name,
                        title,
                        body,
                        should_send_push,
                        should_add_to_history,
                        should_add_to_bulletin
                    FROM msg_templates
                    ORDER BY name, language_code
                    LIMIT $1 OFFSET $2
                    "#,
                )
                .bind(limit)
                .bind(offset)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(templates)
            }
            (Some(limit), None) => {
                let templates = sqlx::query_as::<_, MsgTemplate>(
                    r#"
                    SELECT
                        id,
                        name,
                        language_code,
                        icon_name,
                        title,
                        body,
                        should_send_push,
                        should_add_to_history,
                        should_add_to_bulletin
                    FROM msg_templates
                    ORDER BY name, language_code
                    LIMIT $1
                    "#,
                )
                .bind(limit)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(templates)
            }
            (None, Some(offset)) => {
                let templates = sqlx::query_as::<_, MsgTemplate>(
                    r#"
                    SELECT
                        id,
                        name,
                        language_code,
                        icon_name,
                        title,
                        body,
                        should_send_push,
                        should_add_to_history,
                        should_add_to_bulletin
                    FROM msg_templates
                    ORDER BY name, language_code
                    OFFSET $1
                    "#,
                )
                .bind(offset)
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(templates)
            }
            (None, None) => {
                let templates = sqlx::query_as::<_, MsgTemplate>(
                    r#"
                    SELECT
                        id,
                        name,
                        language_code,
                        icon_name,
                        title,
                        body,
                        should_send_push,
                        should_add_to_history,
                        should_add_to_bulletin
                    FROM msg_templates
                    ORDER BY name, language_code
                    "#,
                )
                .fetch_all(self.read_pool.inner())
                .await?;
                Ok(templates)
            }
        }
    }
}
