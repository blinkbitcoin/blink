use chrono::{DateTime, Utc};
use derive_builder::Builder;
use es_entity::*;
use serde::{Deserialize, Serialize};

use crate::{
    messages::LocalizedStatefulMessage,
    notification_event::{Action, DeepLink, Icon, NotificationEventPayload},
    primitives::*,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum StatefulNotificationEvent {
    Initialized {
        id: StatefulNotificationId,
        galoy_user_id: GaloyUserId,
        message: LocalizedStatefulMessage,
        payload: NotificationEventPayload,
    },
    Acknowledged {
        acknowledged_at: DateTime<Utc>,
    },
}

impl EntityEvent for StatefulNotificationEvent {
    type EntityId = StatefulNotificationId;
    fn event_table_name() -> &'static str {
        "stateful_notification_events"
    }
}

impl EsEntity for StatefulNotification {
    type Event = StatefulNotificationEvent;
}

#[derive(Builder)]
#[builder(pattern = "owned", build_fn(error = "EntityError"))]
pub struct StatefulNotification {
    pub id: StatefulNotificationId,
    pub galoy_user_id: GaloyUserId,
    pub message: LocalizedStatefulMessage,

    payload: NotificationEventPayload,

    pub(super) events: EntityEvents<StatefulNotificationEvent>,
}

impl StatefulNotification {
    pub fn deep_link(&self) -> Option<DeepLink> {
        self.payload.action().and_then(|action| match action {
            Action::OpenDeepLink(deep_link) => Some(deep_link),
            _ => None,
        })
    }

    pub(super) fn acknowledge(&mut self) {
        if self.acknowledged_at().is_none() {
            self.events.push(StatefulNotificationEvent::Acknowledged {
                acknowledged_at: Utc::now(),
            });
        }
    }

    pub fn acknowledged_at(&self) -> Option<DateTime<Utc>> {
        self.events.iter().find_map(|event| {
            if let StatefulNotificationEvent::Acknowledged {
                acknowledged_at: read_at,
            } = event
            {
                Some(*read_at)
            } else {
                None
            }
        })
    }

    pub fn is_acknowledged(&self) -> bool {
        self.acknowledged_at().is_some()
    }

    pub fn created_at(&self) -> chrono::DateTime<chrono::Utc> {
        self.events
            .entity_first_persisted_at
            .expect("entity_first_persisted_at is set at time on entity creation")
    }

    pub fn add_to_bulletin(&self) -> bool {
        self.payload.should_be_added_to_bulletin()
    }

    pub fn action(&self) -> Option<Action> {
        self.payload.action()
    }

    pub fn icon(&self) -> Option<Icon> {
        self.payload.icon()
    }

    pub fn bulletin_key(&self) -> Option<BulletinKey> {
        self.payload.bulletin_key()
    }

    pub fn is_dismissible(&self) -> bool {
        self.payload.is_dismissible()
    }
}

#[derive(Debug, Builder, Clone)]
pub struct NewStatefulNotification {
    #[builder(setter(into))]
    pub id: StatefulNotificationId,
    #[builder(setter(into))]
    pub user_id: GaloyUserId,
    #[builder(setter(into))]
    pub message: LocalizedStatefulMessage,
    #[builder(setter(into))]
    pub payload: NotificationEventPayload,
}

impl NewStatefulNotification {
    pub fn builder() -> NewStatefulNotificationBuilder {
        let mut builder = NewStatefulNotificationBuilder::default();
        builder.id(StatefulNotificationId::new());
        builder
    }

    pub(super) fn bulletin_triggered_at(&self) -> Option<DateTime<Utc>> {
        self.payload.bulletin_key().and(self.payload.triggered_at())
    }

    pub(super) fn is_older_than(&self, latest_activity_at: Option<DateTime<Utc>>) -> bool {
        match (latest_activity_at, self.payload.triggered_at()) {
            (Some(latest_activity_at), Some(triggered_at)) => latest_activity_at > triggered_at,
            _ => false,
        }
    }

    pub(super) fn superseded_initial_events(self) -> EntityEvents<StatefulNotificationEvent> {
        let mut events = self.initial_events();
        events.push(StatefulNotificationEvent::Acknowledged {
            acknowledged_at: Utc::now(),
        });
        events
    }

    pub(super) fn initial_events(self) -> EntityEvents<StatefulNotificationEvent> {
        EntityEvents::init(
            self.id,
            [StatefulNotificationEvent::Initialized {
                id: self.id,
                galoy_user_id: self.user_id,
                message: self.message,
                payload: self.payload,
            }],
        )
    }
}

impl TryFrom<EntityEvents<StatefulNotificationEvent>> for StatefulNotification {
    type Error = EntityError;

    fn try_from(events: EntityEvents<StatefulNotificationEvent>) -> Result<Self, Self::Error> {
        let mut builder = StatefulNotificationBuilder::default();
        for event in events.iter() {
            if let StatefulNotificationEvent::Initialized {
                id,
                galoy_user_id,
                message,
                payload,
            } = event
            {
                builder = builder
                    .id(*id)
                    .galoy_user_id(galoy_user_id.clone())
                    .message(message.clone())
                    .payload(payload.clone());
            }
        }
        builder.events(events).build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::test_support::*;

    fn bulletin_key() -> BulletinKey {
        BulletinKey::try_from("feature-rollout".to_string()).expect("valid key")
    }

    fn notification_with(fixture: BulletinFixture) -> StatefulNotification {
        persisted_bulletin(fixture, Utc::now(), None)
    }

    fn new_bulletin_triggered_at(triggered_at: Option<DateTime<Utc>>) -> NewStatefulNotification {
        new_bulletin(BulletinFixture {
            bulletin_key: Some(bulletin_key()),
            triggered_at,
            ..Default::default()
        })
    }

    #[test]
    fn exposes_bulletin_key_and_dismissible_from_payload() {
        let notification = notification_with(BulletinFixture {
            bulletin_key: Some(bulletin_key()),
            dismissible: false,
            ..Default::default()
        });
        assert_eq!(notification.bulletin_key(), Some(bulletin_key()));
        assert!(!notification.is_dismissible());
    }

    #[test]
    fn defaults_to_unkeyed_and_dismissible() {
        let notification = notification_with(BulletinFixture::default());
        assert!(notification.bulletin_key().is_none());
        assert!(notification.is_dismissible());
    }

    #[test]
    fn acknowledge_is_idempotent() {
        let mut notification = notification_with(BulletinFixture::default());
        notification.acknowledge();
        let first_acknowledged_at = notification.acknowledged_at();
        notification.acknowledge();
        assert!(notification.is_acknowledged());
        assert_eq!(notification.acknowledged_at(), first_acknowledged_at);
        let n_acknowledged_events = notification
            .events
            .iter()
            .filter(|event| matches!(event, StatefulNotificationEvent::Acknowledged { .. }))
            .count();
        assert_eq!(n_acknowledged_events, 1);
    }

    #[test]
    fn newer_notification_is_not_older_than_latest_activity() {
        let now = Utc::now();
        let newer = new_bulletin_triggered_at(Some(now + chrono::Duration::seconds(1)));
        assert!(!newer.is_older_than(Some(now)));
    }

    #[test]
    fn notification_triggered_at_latest_activity_is_not_older() {
        let now = Utc::now();
        assert!(!new_bulletin_triggered_at(Some(now)).is_older_than(Some(now)));
    }

    #[test]
    fn older_notification_is_older_than_latest_activity() {
        let now = Utc::now();
        let older = new_bulletin_triggered_at(Some(now - chrono::Duration::seconds(1)));
        assert!(older.is_older_than(Some(now)));
    }

    #[test]
    fn notification_without_previous_activity_is_not_older() {
        assert!(!new_bulletin_triggered_at(Some(Utc::now())).is_older_than(None));
    }

    #[test]
    fn notification_without_trigger_time_is_not_older() {
        assert!(!new_bulletin_triggered_at(None).is_older_than(Some(Utc::now())));
    }

    #[test]
    fn bulletin_triggered_at_is_only_set_for_keyed_bulletins() {
        let now = Utc::now();
        assert_eq!(
            new_bulletin_triggered_at(Some(now)).bulletin_triggered_at(),
            Some(now)
        );
        let unkeyed = new_bulletin(BulletinFixture {
            triggered_at: Some(now),
            ..Default::default()
        });
        assert!(unkeyed.bulletin_triggered_at().is_none());
    }

    #[test]
    fn superseded_initial_events_are_acknowledged() {
        let notification = StatefulNotification::try_from(
            new_bulletin(BulletinFixture::default()).superseded_initial_events(),
        )
        .expect("could not build notification");
        assert!(notification.is_acknowledged());
    }
}
