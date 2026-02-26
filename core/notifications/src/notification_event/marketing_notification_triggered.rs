use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{Action, Icon, NotificationEvent};
use crate::{messages::*, primitives::*};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MarketingNotificationTriggered {
    pub content: HashMap<GaloyLocale, LocalizedStatefulMessage>,
    pub default_content: LocalizedStatefulMessage,
    pub should_send_push: bool,
    pub should_add_to_history: bool,
    pub should_add_to_bulletin: bool,
    #[serde(default)]
    pub action: Option<Action>,
    #[serde(default)]
    pub icon: Option<Icon>,
}

impl NotificationEvent for MarketingNotificationTriggered {
    fn category(&self) -> UserNotificationCategory {
        UserNotificationCategory::Marketing
    }

    fn action(&self) -> Option<Action> {
        self.action.clone()
    }

    fn should_send_push(&self) -> bool {
        self.should_send_push
    }

    fn to_localized_push_msg(&self, locale: &GaloyLocale) -> LocalizedPushMessage {
        let msg = self.content.get(locale).unwrap_or(&self.default_content);

        LocalizedPushMessage {
            title: msg.title.clone(),
            body: msg.body.clone(),
        }
    }

    fn should_be_added_to_history(&self) -> bool {
        self.should_add_to_history
    }

    fn should_be_added_to_bulletin(&self) -> bool {
        self.should_add_to_bulletin
    }

    fn to_localized_persistent_message(&self, locale: GaloyLocale) -> LocalizedStatefulMessage {
        self.content
            .get(&locale)
            .unwrap_or(&self.default_content)
            .clone()
    }

    fn icon(&self) -> Option<Icon> {
        self.icon.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notification_event::{DeepLink, ExternalUrl};

    fn default_event() -> MarketingNotificationTriggered {
        let default_content = LocalizedStatefulMessage {
            locale: GaloyLocale::from("en".to_string()),
            title: "Test Title".to_string(),
            body: "Test Body".to_string(),
        };
        MarketingNotificationTriggered {
            content: HashMap::new(),
            default_content,
            should_send_push: true,
            should_add_to_history: true,
            should_add_to_bulletin: true,
            action: None,
            icon: None,
        }
    }

    #[test]
    fn action_label_returns_some_when_set_on_deep_link() {
        let mut event = default_event();
        event.action = Some(Action::OpenDeepLink(DeepLink {
            screen: None,
            action: None,
            label: Some("Deposit".to_string()),
        }));

        let action = event.action().expect("should return action");
        assert_eq!(action.label(), Some("Deposit"));
    }

    #[test]
    fn action_label_returns_none_when_not_set() {
        let mut event = default_event();
        event.action = Some(Action::OpenDeepLink(DeepLink {
            screen: None,
            action: None,
            label: None,
        }));

        let action = event.action().expect("should return action");
        assert_eq!(action.label(), None);
    }

    #[test]
    fn action_label_on_external_url() {
        let mut event = default_event();
        event.action = Some(Action::OpenExternalUrl(ExternalUrl::from(
            "https://example.com".to_string(),
        )));

        let action = event.action().expect("should return action");
        assert_eq!(action.label(), None);
    }

    #[test]
    fn push_msg_uses_default_content() {
        let event = default_event();
        let msg = event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        assert_eq!(msg.title, "Test Title");
        assert_eq!(msg.body, "Test Body");
    }

    #[test]
    fn push_msg_uses_localized_content_when_available() {
        let mut event = default_event();
        let es_locale = GaloyLocale::from("es".to_string());
        event.content.insert(
            es_locale.clone(),
            LocalizedStatefulMessage {
                locale: es_locale.clone(),
                title: "Localized Title".to_string(),
                body: "Localized Body".to_string(),
            },
        );

        let msg = event.to_localized_push_msg(&es_locale);
        assert_eq!(msg.title, "Localized Title");
        assert_eq!(msg.body, "Localized Body");
    }

    #[test]
    fn serialize_roundtrip_with_action_label() {
        let mut event = default_event();
        event.action = Some(Action::OpenDeepLink(DeepLink {
            screen: None,
            action: None,
            label: Some("See more".to_string()),
        }));

        let json = serde_json::to_string(&event).expect("should serialize");
        let deserialized: MarketingNotificationTriggered =
            serde_json::from_str(&json).expect("should deserialize");

        let action = deserialized.action().expect("should have action");
        assert_eq!(action.label(), Some("See more"));
    }

    #[test]
    fn deserialize_backward_compat_without_label() {
        let json = r#"{
            "content": {},
            "default_content": {
                "locale": "en",
                "title": "Old notification",
                "body": "No label field"
            },
            "should_send_push": false,
            "should_add_to_history": true,
            "should_add_to_bulletin": false
        }"#;

        let event: MarketingNotificationTriggered =
            serde_json::from_str(json).expect("should deserialize without label");
        assert!(event.action().is_none());
        assert!(event.icon().is_none());
    }

    #[test]
    fn deserialize_backward_compat_external_url_as_string() {
        let json = r#"{
            "content": {},
            "default_content": {
                "locale": "en",
                "title": "Test",
                "body": "Test"
            },
            "should_send_push": true,
            "should_add_to_history": true,
            "should_add_to_bulletin": false,
            "action": { "OpenExternalUrl": "https://example.com" }
        }"#;

        let event: MarketingNotificationTriggered =
            serde_json::from_str(json).expect("should deserialize old ExternalUrl format");
        let action = event.action().expect("should have action");
        assert_eq!(action.label(), None);
    }

    #[test]
    fn icon_returns_value_when_set() {
        let mut event = default_event();
        event.icon = Some(Icon::Bell);

        let icon = event.icon().expect("should return icon");
        assert!(matches!(icon, Icon::Bell));
    }
}
