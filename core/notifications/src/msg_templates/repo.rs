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
    pub deeplink_action: Option<String>,
    pub deeplink_screen: Option<String>,
    pub external_url: Option<String>,
    pub status: Option<String>,
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
        deeplink_action: Option<String>,
        deeplink_screen: Option<String>,
        external_url: Option<String>,
        status: Option<String>,
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
                should_add_to_bulletin,
                deeplink_action,
                deeplink_screen,
                external_url,
                status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING
                id,
                name,
                language_code,
                icon_name,
                title,
                body,
                should_send_push,
                should_add_to_history,
                should_add_to_bulletin,
                deeplink_action,
                deeplink_screen,
                external_url,
                status
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
        .bind(deeplink_action)
        .bind(deeplink_screen)
        .bind(external_url)
        .bind(status)
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
        deeplink_action: Option<String>,
        deeplink_screen: Option<String>,
        external_url: Option<String>,
        status: Option<String>,
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
                should_add_to_bulletin = $9,
                deeplink_action = $10,
                deeplink_screen = $11,
                external_url = $12,
                status = $13
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
                should_add_to_bulletin,
                deeplink_action,
                deeplink_screen,
                external_url,
                status
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
        .bind(deeplink_action)
        .bind(deeplink_screen)
        .bind(external_url)
        .bind(status)
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

    pub async fn find_by_id(&self, id: Uuid) -> Result<Option<MsgTemplate>, sqlx::Error> {
        let row = sqlx::query_as::<_, MsgTemplate>(
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
                should_add_to_bulletin,
                deeplink_action,
                deeplink_screen,
                external_url,
                status
            FROM msg_templates
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn list_templates(
        &self,
        language_code: Option<String>,
        status: Option<String>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<Vec<MsgTemplate>, sqlx::Error> {
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
                should_add_to_bulletin,
                deeplink_action,
                deeplink_screen,
                external_url,
                status
            FROM msg_templates
            WHERE ($1::text IS NULL OR language_code = $1)
                AND ($2::text IS NULL OR status = $2)
            ORDER BY name, language_code
            LIMIT COALESCE($3, 9223372036854775807)
            OFFSET COALESCE($4, 0)
            "#,
        )
        .bind(language_code)
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(self.read_pool.inner())
        .await?;
        Ok(templates)
    }

    pub async fn count_templates(
        &self,
        language_code: Option<String>,
        status: Option<String>,
    ) -> Result<i64, sqlx::Error> {
        let row = sqlx::query_as::<_, (i64,)>(
            r#"
            SELECT COUNT(*)::bigint
            FROM msg_templates
            WHERE ($1::text IS NULL OR language_code = $1)
                AND ($2::text IS NULL OR status = $2)
            "#,
        )
        .bind(language_code)
        .bind(status)
        .fetch_one(self.read_pool.inner())
        .await?;
        Ok(row.0)
    }
}
