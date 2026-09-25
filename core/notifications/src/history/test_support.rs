use std::collections::HashMap;

use chrono::{DateTime, Utc};
use es_entity::{EntityEvents, GenericEvent};

use super::entity::*;
use crate::{
    messages::LocalizedStatefulMessage,
    notification_event::{MarketingNotificationTriggered, NotificationEventPayload},
    primitives::*,
};

pub struct BulletinFixture {
    pub bulletin_key: Option<BulletinKey>,
    pub dismissible: bool,
    pub triggered_at: Option<DateTime<Utc>>,
}

impl Default for BulletinFixture {
    fn default() -> Self {
        Self {
            bulletin_key: None,
            dismissible: true,
            triggered_at: None,
        }
    }
}

fn message() -> LocalizedStatefulMessage {
    LocalizedStatefulMessage {
        locale: GaloyLocale::default(),
        title: "Title".to_string(),
        body: "Body".to_string(),
    }
}

fn payload(fixture: BulletinFixture) -> NotificationEventPayload {
    NotificationEventPayload::from(MarketingNotificationTriggered {
        content: HashMap::new(),
        default_content: message(),
        should_send_push: false,
        should_add_to_history: true,
        should_add_to_bulletin: true,
        action: None,
        icon: None,
        bulletin_key: fixture.bulletin_key,
        dismissible: fixture.dismissible,
        triggered_at: fixture.triggered_at,
    })
}

pub fn new_bulletin(fixture: BulletinFixture) -> NewStatefulNotification {
    NewStatefulNotification::builder()
        .user_id(GaloyUserId::from("user-id".to_string()))
        .message(message())
        .payload(payload(fixture))
        .build()
        .expect("could not build new notification")
}

fn generic_event(
    id: StatefulNotificationId,
    sequence: i32,
    event: StatefulNotificationEvent,
    created_at: DateTime<Utc>,
) -> GenericEvent {
    GenericEvent {
        id: id.into(),
        sequence,
        event: serde_json::to_value(event).expect("could not serialize event"),
        entity_created_at: created_at,
        event_recorded_at: created_at,
    }
}

pub fn persisted_bulletin(
    fixture: BulletinFixture,
    created_at: DateTime<Utc>,
    acknowledged_at: Option<DateTime<Utc>>,
) -> StatefulNotification {
    let id = StatefulNotificationId::new();
    let initialized = StatefulNotificationEvent::Initialized {
        id,
        galoy_user_id: GaloyUserId::from("user-id".to_string()),
        message: message(),
        payload: payload(fixture),
    };
    let mut events = vec![generic_event(id, 1, initialized, created_at)];
    if let Some(acknowledged_at) = acknowledged_at {
        let acknowledged = StatefulNotificationEvent::Acknowledged { acknowledged_at };
        events.push(generic_event(id, 2, acknowledged, created_at));
    }
    EntityEvents::load_first(events).expect("could not load notification")
}
