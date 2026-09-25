use es_entity::*;
use sqlx::PgPool;

use std::collections::{BTreeMap, HashMap, HashSet};

use crate::primitives::*;

use super::{entity::*, error::*};

#[derive(Debug, Clone)]
pub(super) struct PersistentNotifications {
    pool: PgPool,
    read_pool: ReadPool,
}

impl PersistentNotifications {
    pub fn new(pool: PgPool, read_pool: ReadPool) -> Self {
        Self { pool, read_pool }
    }

    pub async fn create_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        notification: NewStatefulNotification,
    ) -> Result<(), NotificationHistoryError> {
        self.create_new_batch(tx, vec![notification]).await
    }

    pub async fn create_new_batch(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        new_notifications: Vec<NewStatefulNotification>,
    ) -> Result<(), NotificationHistoryError> {
        let superseded_ids = self
            .acknowledge_bulletins_replaced_by(tx, &new_notifications)
            .await?;
        let mut query_builder = sqlx::QueryBuilder::new(
            "INSERT INTO stateful_notifications (id, galoy_user_id, bulletin_enabled, bulletin_key, bulletin_triggered_at, acknowledged)",
        );
        query_builder.push_values(new_notifications.iter(), |mut builder, notification| {
            builder.push_bind(notification.id as StatefulNotificationId);
            builder.push_bind(notification.user_id.as_ref());
            builder.push_bind(notification.payload.should_be_added_to_bulletin());
            builder.push_bind(
                notification
                    .payload
                    .bulletin_key()
                    .map(BulletinKey::into_inner),
            );
            builder.push_bind(notification.bulletin_triggered_at());
            builder.push_bind(superseded_ids.contains(&notification.id));
        });
        let query = query_builder.build();
        query.execute(&mut **tx).await?;
        es_entity::EntityEvents::batch_persist(
            tx,
            new_notifications.into_iter().map(|notification| {
                if superseded_ids.contains(&notification.id) {
                    return notification.superseded_initial_events();
                }
                notification.initial_events()
            }),
        )
        .await?;
        Ok(())
    }

    pub async fn acknowledge_for_user(
        &self,
        user_id: GaloyUserId,
        id: StatefulNotificationId,
    ) -> Result<StatefulNotification, NotificationHistoryError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query!(
            r#"SELECT id FROM stateful_notifications
            WHERE id = $1 AND galoy_user_id = $2
            FOR UPDATE"#,
            id as StatefulNotificationId,
            user_id.as_ref(),
        )
        .fetch_optional(&mut *tx)
        .await?;
        let mut notification = self.find_by_id_in_tx(&mut tx, user_id, id).await?;
        notification.acknowledge();
        sqlx::query!(
            r#"UPDATE stateful_notifications
            SET acknowledged = $1
            WHERE id = $2 AND galoy_user_id = $3"#,
            notification.is_acknowledged(),
            notification.id as StatefulNotificationId,
            notification.galoy_user_id.as_ref(),
        )
        .execute(&mut *tx)
        .await?;
        notification.events.persist(&mut tx).await?;
        tx.commit().await?;
        Ok(notification)
    }

    pub async fn close_bulletin_for_user(
        &self,
        user_id: GaloyUserId,
        bulletin_key: BulletinKey,
    ) -> Result<(), NotificationHistoryError> {
        let mut tx = self.pool.begin().await?;
        self.lock_bulletin_key_in_tx(&mut tx, &bulletin_key).await?;
        sqlx::query!(
            r#"INSERT INTO stateful_notification_bulletin_closures (galoy_user_id, bulletin_key, closed_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (galoy_user_id, bulletin_key)
            DO UPDATE SET closed_at = GREATEST(stateful_notification_bulletin_closures.closed_at, EXCLUDED.closed_at)"#,
            user_id.as_ref(),
            bulletin_key.as_ref(),
            chrono::Utc::now(),
        )
        .execute(&mut *tx)
        .await?;
        let active_bulletins = self
            .find_active_bulletins_for_update_in_tx(&mut tx, &[user_id], &bulletin_key)
            .await?;
        self.acknowledge_in_tx(&mut tx, active_bulletins).await?;
        tx.commit().await?;
        Ok(())
    }

    // Returns the ids of new notifications that are older than the latest send or close
    // of the same key for their user, so they are stored as already acknowledged.
    async fn acknowledge_bulletins_replaced_by(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        new_notifications: &[NewStatefulNotification],
    ) -> Result<HashSet<StatefulNotificationId>, NotificationHistoryError> {
        let mut new_notifications_by_key: BTreeMap<BulletinKey, Vec<&NewStatefulNotification>> =
            BTreeMap::new();
        for notification in new_notifications {
            if let Some(bulletin_key) = notification.payload.bulletin_key() {
                new_notifications_by_key
                    .entry(bulletin_key)
                    .or_default()
                    .push(notification);
            }
        }

        let mut superseded_ids = HashSet::new();
        for (bulletin_key, notifications) in new_notifications_by_key {
            self.lock_bulletin_key_in_tx(tx, &bulletin_key).await?;
            let user_ids = notifications
                .iter()
                .map(|notification| notification.user_id.clone())
                .collect::<Vec<_>>();
            let latest_activity_by_user = self
                .latest_bulletin_activity_in_tx(tx, &user_ids, &bulletin_key)
                .await?;

            let mut replacing_user_ids = Vec::new();
            for notification in notifications {
                let latest_activity_at =
                    latest_activity_by_user.get(&notification.user_id).copied();
                if notification.is_older_than(latest_activity_at) {
                    superseded_ids.insert(notification.id);
                    continue;
                }
                replacing_user_ids.push(notification.user_id.clone());
            }
            let replaced = self
                .find_active_bulletins_for_update_in_tx(tx, &replacing_user_ids, &bulletin_key)
                .await?;
            self.acknowledge_in_tx(tx, replaced).await?;
        }
        Ok(superseded_ids)
    }

    // Serializes every writer of the same key (sends, retries and admin closes) so that
    // concurrent inserts never violate the unique index on active keyed bulletins.
    async fn lock_bulletin_key_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        bulletin_key: &BulletinKey,
    ) -> Result<(), NotificationHistoryError> {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(format!(
                "stateful_notifications.bulletin_key:{bulletin_key}"
            ))
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    async fn latest_bulletin_activity_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        user_ids: &[GaloyUserId],
        bulletin_key: &BulletinKey,
    ) -> Result<HashMap<GaloyUserId, chrono::DateTime<chrono::Utc>>, NotificationHistoryError> {
        let user_ids = user_ids
            .iter()
            .map(|id| id.as_ref().to_string())
            .collect::<Vec<_>>();
        let rows = sqlx::query!(
            r#"SELECT u.galoy_user_id AS "galoy_user_id!",
                GREATEST(
                  (SELECT MAX(n.bulletin_triggered_at) FROM stateful_notifications n
                   WHERE n.galoy_user_id = u.galoy_user_id AND n.bulletin_key = $2),
                  (SELECT c.closed_at FROM stateful_notification_bulletin_closures c
                   WHERE c.galoy_user_id = u.galoy_user_id AND c.bulletin_key = $2)
                ) AS latest_activity_at
            FROM UNNEST($1::VARCHAR[]) AS u(galoy_user_id)"#,
            &user_ids,
            bulletin_key.as_ref(),
        )
        .fetch_all(&mut **tx)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                row.latest_activity_at.map(|latest_activity_at| {
                    (GaloyUserId::from(row.galoy_user_id), latest_activity_at)
                })
            })
            .collect())
    }

    // Rows are locked before their events are read so the loaded events are current.
    async fn find_active_bulletins_for_update_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        user_ids: &[GaloyUserId],
        bulletin_key: &BulletinKey,
    ) -> Result<Vec<StatefulNotification>, NotificationHistoryError> {
        if user_ids.is_empty() {
            return Ok(Vec::new());
        }
        let user_ids = user_ids
            .iter()
            .map(|id| id.as_ref().to_string())
            .collect::<Vec<_>>();
        let ids = sqlx::query_scalar!(
            r#"SELECT id FROM stateful_notifications
            WHERE galoy_user_id = ANY($1)
            AND bulletin_key = $2
            AND acknowledged IS NOT TRUE
            FOR UPDATE"#,
            &user_ids,
            bulletin_key.as_ref(),
        )
        .fetch_all(&mut **tx)
        .await?;
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let rows = sqlx::query_as!(
            GenericEvent,
            r#"SELECT a.id, e.sequence, e.event,
                      a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM stateful_notifications a
            JOIN stateful_notification_events e ON a.id = e.id
            WHERE a.id = ANY($1)
            ORDER BY a.id, e.sequence"#,
            &ids,
        )
        .fetch_all(&mut **tx)
        .await?;
        let (notifications, _) = EntityEvents::load_n::<StatefulNotification>(rows, usize::MAX)?;
        Ok(notifications)
    }

    async fn acknowledge_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        notifications: Vec<StatefulNotification>,
    ) -> Result<(), NotificationHistoryError> {
        if notifications.is_empty() {
            return Ok(());
        }

        let ids = notifications
            .iter()
            .map(|notification| uuid::Uuid::from(notification.id))
            .collect::<Vec<_>>();
        sqlx::query!(
            r#"UPDATE stateful_notifications
            SET acknowledged = TRUE
            WHERE id = ANY($1)"#,
            &ids,
        )
        .execute(&mut **tx)
        .await?;

        let newly_acknowledged_events = notifications
            .into_iter()
            .filter(|notification| !notification.is_acknowledged())
            .map(|mut notification| {
                notification.acknowledge();
                notification.events
            })
            .collect::<Vec<_>>();
        if newly_acknowledged_events.is_empty() {
            return Ok(());
        }
        EntityEvents::batch_persist(tx, newly_acknowledged_events).await?;
        Ok(())
    }

    pub async fn list_latest_bulletins_for_users(
        &self,
        user_ids: &[GaloyUserId],
        bulletin_key: &BulletinKey,
    ) -> Result<Vec<StatefulNotification>, NotificationHistoryError> {
        let user_ids = user_ids
            .iter()
            .map(|id| id.as_ref().to_string())
            .collect::<Vec<_>>();
        let rows = sqlx::query_as!(
            GenericEvent,
            r#"WITH latest AS (
                 SELECT DISTINCT ON (galoy_user_id) id, created_at
                 FROM stateful_notifications
                 WHERE galoy_user_id = ANY($1) AND bulletin_key = $2
                 ORDER BY galoy_user_id, (acknowledged IS NOT TRUE) DESC, created_at DESC, id DESC
               )
            SELECT a.id, e.sequence, e.event,
                      a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM latest a
            JOIN stateful_notification_events e ON a.id = e.id
            ORDER BY a.id, e.sequence"#,
            &user_ids,
            bulletin_key.as_ref(),
        )
        .fetch_all(&self.pool)
        .await?;
        let (notifications, _) = EntityEvents::load_n::<StatefulNotification>(rows, usize::MAX)?;
        Ok(notifications)
    }

    pub async fn count_unacknowledged_non_bulletins_for_user(
        &self,
        user_id: GaloyUserId,
    ) -> Result<u64, NotificationHistoryError> {
        let count = sqlx::query_scalar!(
            r#"SELECT COUNT(*) AS "count!"
            FROM stateful_notifications
            WHERE galoy_user_id = $1 AND acknowledged = FALSE AND bulletin_enabled = FALSE"#,
            user_id.as_ref(),
        )
        .fetch_one(self.read_pool.inner())
        .await?;
        Ok(count as u64)
    }

    async fn find_by_id_in_tx(
        &self,
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        user_id: GaloyUserId,
        id: StatefulNotificationId,
    ) -> Result<StatefulNotification, NotificationHistoryError> {
        let rows = sqlx::query_as!(
            GenericEvent,
            r#"SELECT a.id, e.sequence, e.event,
                      a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM stateful_notifications a
            JOIN stateful_notification_events e ON a.id = e.id
            WHERE a.galoy_user_id = $1 AND a.id = $2
            ORDER BY e.sequence"#,
            user_id.as_ref(),
            id as StatefulNotificationId,
        )
        .fetch_all(&mut **tx)
        .await?;

        let res = EntityEvents::load_first::<StatefulNotification>(rows)?;
        Ok(res)
    }

    pub async fn list_for_user(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), NotificationHistoryError> {
        let rows = sqlx::query_as!(
            GenericEvent,
            r#"WITH anchor AS (
                 SELECT created_at FROM stateful_notifications WHERE id = $2 LIMIT 1
               )
            SELECT a.id, e.sequence, e.event,
                      a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM stateful_notifications a
            JOIN stateful_notification_events e ON a.id = e.id
            WHERE a.galoy_user_id = $1 AND (
                    $2 IS NOT NULL AND a.created_at < (SELECT created_at FROM anchor)
                    OR $2 IS NULL)
            ORDER BY a.created_at DESC, a.id, e.sequence
            LIMIT $3"#,
            user_id.as_ref(),
            after as Option<StatefulNotificationId>,
            first as i64 + 1
        )
        .fetch_all(self.read_pool.inner())
        .await?;
        let res = EntityEvents::load_n::<StatefulNotification>(rows, first)?;
        Ok(res)
    }

    pub async fn list_for_user_without_bulletin_enabled(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), NotificationHistoryError> {
        let rows = sqlx::query_as!(
            GenericEvent,
            r#"WITH anchor AS (
                 SELECT created_at FROM stateful_notifications
                 WHERE id = $2 AND bulletin_enabled IS FALSE
                 LIMIT 1
               )
            SELECT a.id, e.sequence, e.event,
                      a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM stateful_notifications a
            JOIN stateful_notification_events e ON a.id = e.id
            WHERE a.galoy_user_id = $1 AND (
                    $2 IS NOT NULL AND a.created_at < (SELECT created_at FROM anchor)
                    OR $2 IS NULL)
                    AND bulletin_enabled IS FALSE
            ORDER BY a.created_at DESC, a.id, e.sequence
            LIMIT $3"#,
            user_id.as_ref(),
            after as Option<StatefulNotificationId>,
            first as i64 + 1
        )
        .fetch_all(self.read_pool.inner())
        .await?;
        let res = EntityEvents::load_n::<StatefulNotification>(rows, first)?;
        Ok(res)
    }

    pub async fn list_unacknowledged_bulletins_for_user(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), NotificationHistoryError> {
        let rows = sqlx::query_as!(
            GenericEvent,
            r#"
            WITH anchor AS (
            SELECT created_at FROM stateful_notifications
            WHERE id = $2 AND bulletin_enabled IS TRUE AND acknowledged IS FALSE
            LIMIT 1
            )
            SELECT a.id, e.sequence, e.event,
               a.created_at AS entity_created_at, e.recorded_at AS event_recorded_at
            FROM stateful_notifications a
            JOIN stateful_notification_events e ON a.id = e.id
            WHERE a.galoy_user_id = $1
            AND bulletin_enabled IS TRUE
            AND acknowledged IS FALSE
            AND ($2 IS NOT NULL AND a.created_at < (SELECT created_at FROM anchor)
               OR $2 IS NULL)
            ORDER BY a.created_at DESC, a.id, e.sequence
            LIMIT $3
            "#,
            user_id.as_ref(),
            after as Option<StatefulNotificationId>,
            first as i64 + 1
        )
        .fetch_all(self.read_pool.inner())
        .await?;
        let res = EntityEvents::load_n::<StatefulNotification>(rows, first)?;
        Ok(res)
    }
}
