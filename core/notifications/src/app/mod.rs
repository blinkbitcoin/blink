mod config;
pub mod error;

use sqlx::{Pool, Postgres};
use sqlxmq::JobRunnerHandle;
use tracing::instrument;

use std::{collections::HashSet, sync::Arc};

use crate::{
    email_executor::EmailExecutor, email_reminder_projection::EmailReminderProjection, history::*,
    job, notification_cool_off_tracker::*, notification_event::*, primitives::*, push_executor::*,
    user_notification_settings::*, msg_templates::MsgTemplateRepository,
    msg_messages::MsgMessageRepository,
    msg_message_history::MsgMessageHistoryRepository,
};

pub use config::*;
use error::*;

#[derive(Clone)]
pub struct NotificationsApp {
    _config: AppConfig,
    settings: UserNotificationSettingsRepo,
    email_reminder_projection: EmailReminderProjection,
    history: NotificationHistory,
    pool: Pool<Postgres>,
    msg_template_repository: MsgTemplateRepository,
    msg_message_repository: MsgMessageRepository,
    msg_message_history_repository: MsgMessageHistoryRepository,
    _runner: Arc<Option<JobRunnerHandle>>,
}

impl NotificationsApp {
    pub async fn init(
        pool: Pool<Postgres>,
        read_pool: ReadPool,
        config: AppConfig,
    ) -> Result<Self, ApplicationError> {
        let settings = UserNotificationSettingsRepo::new(&pool, &read_pool);
        let push_executor =
            PushExecutor::init(config.push_executor.clone(), settings.clone()).await?;
        let email_executor = EmailExecutor::init(config.email_executor.clone(), settings.clone())?;
        let email_reminder_projection =
            EmailReminderProjection::new(&pool, config.link_email_reminder.clone());
        let history = NotificationHistory::new(&pool, &read_pool, settings.clone());
        let msg_template_repository = MsgTemplateRepository::new(&pool, &read_pool);
        let msg_message_repository = MsgMessageRepository::new(&pool, &read_pool);
        let msg_message_history_repository = MsgMessageHistoryRepository::new(&pool, &read_pool);
        let runner = job::start_job_runner(
            &pool,
            push_executor,
            email_executor,
            settings.clone(),
            history.clone(),
            email_reminder_projection.clone(),
            config.jobs.clone(),
        )
        .await?;
        Self::spawn_kickoff_link_email_reminder(
            pool.clone(),
            config.jobs.kickoff_link_email_reminder_delay,
        )
        .await?;
        Ok(Self {
            _config: config,
            pool,
            settings,
            history,
            email_reminder_projection,
            msg_template_repository,
            msg_message_repository,
            msg_message_history_repository,
            _runner: Arc::new(runner),
        })
    }

    #[instrument(name = "app.notification_settings_for_user", skip(self), err)]
    pub async fn notification_settings_for_user(
        &self,
        user_id: GaloyUserId,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let user_settings = self.settings.find_for_user_id(&user_id).await?;

        Ok(user_settings)
    }

    #[instrument(name = "app.disable_channel_on_user", skip(self), err)]
    pub async fn disable_channel_on_user(
        &self,
        user_id: GaloyUserId,
        channel: UserNotificationChannel,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.disable_channel(channel);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.enable_channel_on_user", skip(self), err)]
    pub async fn enable_channel_on_user(
        &self,
        user_id: GaloyUserId,
        channel: UserNotificationChannel,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;

        user_settings.enable_channel(channel);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.disable_category_on_user", skip(self), err)]
    pub async fn disable_category_on_user(
        &self,
        user_id: GaloyUserId,
        channel: UserNotificationChannel,
        category: UserNotificationCategory,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.disable_category(channel, category);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.enable_category_on_user", skip(self), err)]
    pub async fn enable_category_on_user(
        &self,
        user_id: GaloyUserId,
        channel: UserNotificationChannel,
        category: UserNotificationCategory,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.enable_category(channel, category);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.update_user_locale", skip(self), err)]
    pub async fn update_locale_on_user(
        &self,
        user_id: GaloyUserId,
        locale: String,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        if locale.is_empty() {
            user_settings.set_locale_to_default()
        } else {
            user_settings.update_locale(GaloyLocale::from(locale));
        }
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.add_push_device_token", skip(self), err)]
    pub async fn add_push_device_token(
        &self,
        user_id: GaloyUserId,
        device_token: PushDeviceToken,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.add_push_device_token(device_token);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.remove_push_device_token", skip(self), err)]
    pub async fn remove_push_device_token(
        &self,
        user_id: GaloyUserId,
        device_token: PushDeviceToken,
    ) -> Result<UserNotificationSettings, ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.remove_push_device_token(device_token);
        self.settings.persist(&mut user_settings).await?;
        Ok(user_settings)
    }

    #[instrument(name = "app.update_email_address", skip(self), err)]
    pub async fn update_email_address(
        &self,
        user_id: GaloyUserId,
        addr: GaloyEmailAddress,
    ) -> Result<(), ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.update_email_address(addr);
        let mut tx = self.pool.begin().await?;
        self.settings
            .persist_in_tx(&mut tx, &mut user_settings)
            .await?;
        self.email_reminder_projection
            .user_added_email(&mut tx, user_id)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    #[instrument(name = "app.remove_email_address", skip(self), err)]
    pub async fn remove_email_address(&self, user_id: GaloyUserId) -> Result<(), ApplicationError> {
        let mut user_settings = self.settings.find_for_user_id_for_mut(&user_id).await?;
        user_settings.remove_email_address();
        self.settings.persist(&mut user_settings).await?;
        Ok(())
    }

    #[instrument(name = "app.handle_single_user_event", skip(self), err)]
    pub async fn handle_single_user_event<T: std::fmt::Debug>(
        &self,
        user_id: GaloyUserId,
        event: T,
    ) -> Result<(), ApplicationError>
    where
        NotificationEventPayload: From<T>,
    {
        let payload = NotificationEventPayload::from(event);
        let mut tx = self.pool.begin().await?;
        if payload.should_send_email() {
            job::spawn_send_email_notification(&mut tx, (user_id.clone(), payload.clone())).await?;
        }

        self.history
            .add_event(&mut tx, user_id.clone(), payload.clone())
            .await?;

        if payload.should_send_push() {
            job::spawn_send_push_notification(&mut tx, (user_id, payload)).await?;
        }

        tx.commit().await?;
        Ok(())
    }

    #[instrument(name = "app.handle_transaction_occurred_event", skip(self), err)]
    pub async fn handle_transaction_occurred_event(
        &self,
        user_id: GaloyUserId,
        transaction_occurred: TransactionOccurred,
    ) -> Result<(), ApplicationError> {
        let user_settings = self.settings.find_for_user_id(&user_id).await?;
        if user_settings.email_address().is_none() {
            self.email_reminder_projection
                .transaction_occurred_for_user_without_email(&user_id)
                .await?;
        }
        self.handle_single_user_event(user_id, transaction_occurred)
            .await
    }

    #[instrument(name = "app.handle_price_changed_event", skip(self), err)]
    pub async fn handle_price_changed_event(
        &self,
        price_changed: PriceChanged,
    ) -> Result<(), ApplicationError> {
        let mut tx = self.pool.begin().await?;
        let last_trigger =
            NotificationCoolOffTracker::update_price_changed_trigger(&mut tx).await?;

        if price_changed.should_notify(last_trigger) {
            job::spawn_all_user_event_dispatch(
                &mut tx,
                NotificationEventPayload::from(price_changed),
            )
            .await?;

            tx.commit().await?;
        }

        Ok(())
    }

    #[instrument(
        name = "app.handle_marketing_notification_triggered_event",
        skip(self),
        err
    )]
    pub async fn handle_marketing_notification_triggered_event(
        &self,
        user_ids: HashSet<GaloyUserId>,
        marketing_notification: MarketingNotificationTriggered,
    ) -> Result<(), ApplicationError> {
        let mut tx = self.pool.begin().await?;
        job::spawn_multi_user_event_dispatch(
            &mut tx,
            (
                user_ids.into_iter().collect(),
                NotificationEventPayload::from(marketing_notification),
            ),
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    #[instrument(name = "app.list_stateful_notifications", skip(self), err)]
    pub async fn list_stateful_notifications(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), ApplicationError> {
        let ret = self
            .history
            .list_notifications_for_user(user_id, first, after)
            .await?;
        Ok(ret)
    }

    #[instrument(
        name = "app.list_stateful_notifications_without_bulletin_enabled",
        skip(self),
        err
    )]
    pub async fn list_stateful_notifications_without_bulletin_enabled(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), ApplicationError> {
        let ret = self
            .history
            .list_notifications_without_bulletin_enabled_for_user(user_id, first, after)
            .await?;
        Ok(ret)
    }

    #[instrument(
        name = "app.list_unacknowledged_stateful_notifications_with_bulletin_enabled",
        skip(self),
        err
    )]
    pub async fn list_unacknowledged_stateful_notifications_with_bulletin_enabled(
        &self,
        user_id: GaloyUserId,
        first: usize,
        after: Option<StatefulNotificationId>,
    ) -> Result<(Vec<StatefulNotification>, bool), ApplicationError> {
        let ret = self
            .history
            .list_unacknowledged_notifications_with_bulletin_for_user(user_id, first, after)
            .await?;
        Ok(ret)
    }

    #[instrument(name = "app.acknowledge_notification", skip(self), err)]
    pub async fn acknowledge_notification(
        &self,
        user_id: GaloyUserId,
        notification_id: StatefulNotificationId,
    ) -> Result<StatefulNotification, ApplicationError> {
        let notification = self
            .history
            .acknowledge_notification_for_user(user_id, notification_id)
            .await?;
        Ok(notification)
    }

    #[instrument(
        name = "app.count_unacknowledged_stateful_notifications_without_bulletin_enabled",
        skip(self),
        err
    )]
    pub async fn count_unacknowledged_stateful_notifications_without_bulletin_enabled(
        &self,
        user_id: GaloyUserId,
    ) -> Result<u64, ApplicationError> {
        let count = self
            .history
            .count_unacknowledged_notifications_without_bulletin_enabled_for_user(user_id)
            .await?;
        Ok(count)
    }

    #[instrument(
        name = "app.kickoff_link_email_reminder",
        level = "trace",
        skip_all,
        err
    )]
    async fn spawn_kickoff_link_email_reminder(
        pool: sqlx::PgPool,
        delay: std::time::Duration,
    ) -> Result<(), ApplicationError> {
        tokio::spawn(async move {
            loop {
                let _ = job::spawn_kickoff_link_email_reminder(
                    &pool,
                    std::time::Duration::from_secs(1),
                )
                .await;
                tokio::time::sleep(delay).await;
            }
        });
        Ok(())
    }

    #[instrument(name = "app.msg_template_create", skip(self), err)]
    pub async fn msg_template_create(
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
    ) -> Result<crate::msg_templates::MsgTemplate, ApplicationError> {
        let template = self
            .msg_template_repository
            .create_template(
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
                status,
            )
            .await?;
        Ok(template)
    }

    #[instrument(name = "app.msg_template_update", skip(self), err)]
    pub async fn msg_template_update(
        &self,
        id: uuid::Uuid,
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
    ) -> Result<crate::msg_templates::MsgTemplate, ApplicationError> {
        let template = self
            .msg_template_repository
            .update_template(
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
                status,
            )
            .await?;
        Ok(template)
    }

    #[instrument(name = "app.msg_template_delete", skip(self), err)]
    pub async fn msg_template_delete(
        &self,
        id: uuid::Uuid,
    ) -> Result<uuid::Uuid, ApplicationError> {
        let deleted_id = self.msg_template_repository.delete_template(id).await?;
        Ok(deleted_id)
    }

    #[instrument(name = "app.msg_template_by_id", skip(self), err)]
    pub async fn msg_template_by_id(
        &self,
        id: uuid::Uuid,
    ) -> Result<Option<crate::msg_templates::MsgTemplate>, ApplicationError> {
        let template = self.msg_template_repository.find_by_id(id).await?;
        Ok(template)
    }

    #[instrument(name = "app.msg_templates_list", skip(self), err)]
    pub async fn list_msg_templates(
        &self,
        language_code: Option<String>,
        status: Option<String>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<(Vec<crate::msg_templates::MsgTemplate>, i64), ApplicationError> {
        let templates = self
            .msg_template_repository
            .list_templates(language_code.clone(), status.clone(), limit, offset)
            .await?;
        let total = self.msg_template_repository.count_templates(language_code, status).await?;
        Ok((templates, total))
    }

    #[instrument(name = "app.msg_message_create", skip(self), err)]
    pub async fn msg_message_create(
        &self,
        username: String,
        status: String,
        sent_by: String,
        template_id: uuid::Uuid,
    ) -> Result<crate::msg_messages::MsgMessage, ApplicationError> {
        let mut tx = self.pool.begin().await?;

        let status = if status.is_empty() {
            "invited".to_string()
        } else {
            status
        };

        let message = self
            .msg_message_repository
            .create_message_in_tx(&mut tx, username, status.clone(), sent_by, template_id)
            .await?;

        self.msg_message_history_repository
            .create_history_in_tx(&mut tx, message.id, status)
            .await?;

        tx.commit().await?;
        Ok(message)
    }

    #[instrument(name = "app.msg_message_update_status", skip(self), err)]
    pub async fn msg_message_update_status(
        &self,
        id: uuid::Uuid,
        status: String,
    ) -> Result<crate::msg_messages::MsgMessage, ApplicationError> {
        let mut tx = self.pool.begin().await?;

        let message = self
            .msg_message_repository
            .update_message_status_in_tx(&mut tx, id, status.clone())
            .await?;

        self.msg_message_history_repository
            .create_history_in_tx(&mut tx, message.id, status)
            .await?;

        tx.commit().await?;
        Ok(message)
    }

    #[instrument(name = "app.msg_messages_list", skip(self), err)]
    pub async fn list_msg_messages(
        &self,
        username: Option<String>,
        status: Option<String>,
        updated_at_from: Option<chrono::DateTime<chrono::Utc>>,
        updated_at_to: Option<chrono::DateTime<chrono::Utc>>,
        limit: Option<i64>,
        offset: Option<i64>,
    ) -> Result<(Vec<crate::msg_messages::MsgMessage>, i64), ApplicationError> {
        let messages = self
            .msg_message_repository
            .list_messages(username.clone(), status.clone(), updated_at_from, updated_at_to, limit, offset)
            .await?;
        let total = self
            .msg_message_repository
            .count_messages(username, status, updated_at_from, updated_at_to)
            .await?;
        Ok((messages, total))
    }

    #[instrument(name = "app.msg_message_history_list_by_message_id", skip(self), err)]
    pub async fn list_msg_message_history_by_message_id(
        &self,
        msg_message_id: uuid::Uuid,
    ) -> Result<Vec<crate::msg_message_history::MsgMessageHistory>, ApplicationError> {
        let rows = self
            .msg_message_history_repository
            .list_history_by_message_id(msg_message_id)
            .await?;
        Ok(rows)
    }
}
