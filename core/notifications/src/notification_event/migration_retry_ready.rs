use rust_i18n::t;
use serde::{Deserialize, Serialize};

use super::{Action, DeepLink, DeepLinkScreen, NotificationEvent};
use crate::{messages::*, primitives::*};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MigrationRetryReady {}

impl NotificationEvent for MigrationRetryReady {
    fn category(&self) -> UserNotificationCategory {
        UserNotificationCategory::AdminNotification
    }

    fn action(&self) -> Option<Action> {
        Some(Action::OpenDeepLink(DeepLink {
            screen: Some(DeepLinkScreen::AccountMigration),
            action: None,
            label: None,
        }))
    }

    fn should_send_push(&self) -> bool {
        true
    }

    fn to_localized_push_msg(&self, locale: &GaloyLocale) -> LocalizedPushMessage {
        let title = t!("migration_retry_ready.title", locale = locale.as_ref()).to_string();
        let body = t!("migration_retry_ready.body", locale = locale.as_ref()).to_string();
        LocalizedPushMessage { title, body }
    }

    fn should_be_added_to_history(&self) -> bool {
        true
    }

    fn to_localized_persistent_message(&self, locale: GaloyLocale) -> LocalizedStatefulMessage {
        let push_msg = self.to_localized_push_msg(&locale);

        LocalizedStatefulMessage {
            locale,
            title: push_msg.title,
            body: push_msg.body,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn push_msg_correctly_formatted() {
        let event = MigrationRetryReady {};
        let localized_message = event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        assert_eq!(
            localized_message.title,
            "Your migration is ready to retry"
        );
        assert_eq!(
            localized_message.body,
            "We've reset your migration so you can try again. Tap to continue moving your funds."
        );
    }

    #[test]
    fn push_msg_falls_back_to_en_for_missing_translation() {
        let event = MigrationRetryReady {};
        let en = event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        let missing =
            event.to_localized_push_msg(&GaloyLocale::from("zz-untranslated".to_string()));
        assert_eq!(missing.title, en.title);
        assert_eq!(missing.body, en.body);
    }

    #[test]
    fn delivered_as_admin_notification_with_history_entry() {
        let event = MigrationRetryReady {};
        assert!(event.should_send_push());
        assert!(event.should_be_added_to_history());
        assert!(matches!(
            event.category(),
            UserNotificationCategory::AdminNotification
        ));
    }

    #[test]
    fn history_message_matches_push_message() {
        let event = MigrationRetryReady {};
        let locale = GaloyLocale::from("en".to_string());
        let push = event.to_localized_push_msg(&locale);
        let persistent = event.to_localized_persistent_message(locale.clone());
        assert_eq!(persistent.title, push.title);
        assert_eq!(persistent.body, push.body);
        assert_eq!(persistent.locale, locale);
    }

    #[test]
    fn action_deep_links_to_account_migration() {
        let event = MigrationRetryReady {};
        let action = event.action().expect("action should be set");
        let Action::OpenDeepLink(deep_link) = action else {
            panic!("expected deep link action");
        };
        assert_eq!(deep_link.to_link_string(), "/account-migration");
    }
}
