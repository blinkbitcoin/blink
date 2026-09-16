use rust_i18n::t;
use serde::{Deserialize, Serialize};

use super::NotificationEvent;
use crate::{messages::*, primitives::*};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InactivityFeeNotice {
    /// First day the fee applies, `YYYY-MM-DD`. Computed by core and rendered verbatim: this
    /// service never derives lifecycle dates.
    pub effective_date: String,
}

impl NotificationEvent for InactivityFeeNotice {
    fn category(&self) -> UserNotificationCategory {
        UserNotificationCategory::AdminNotification
    }

    fn should_send_push(&self) -> bool {
        true
    }

    fn to_localized_push_msg(&self, locale: &GaloyLocale) -> LocalizedPushMessage {
        let title = t!("inactivity_fee_notice.push.title", locale = locale.as_ref()).to_string();
        let body = t!(
            "inactivity_fee_notice.push.body",
            locale = locale.as_ref(),
            date = self.effective_date
        )
        .to_string();
        LocalizedPushMessage { title, body }
    }

    fn should_be_added_to_history(&self) -> bool {
        true
    }

    fn should_be_added_to_bulletin(&self) -> bool {
        true
    }

    fn to_localized_persistent_message(&self, locale: GaloyLocale) -> LocalizedStatefulMessage {
        let title = t!(
            "inactivity_fee_notice.bulletin.title",
            locale = locale.as_ref()
        )
        .to_string();
        let body = t!(
            "inactivity_fee_notice.bulletin.body",
            locale = locale.as_ref(),
            date = self.effective_date
        )
        .to_string();
        LocalizedStatefulMessage {
            locale,
            title,
            body,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event() -> InactivityFeeNotice {
        InactivityFeeNotice {
            effective_date: "2026-10-15".to_string(),
        }
    }

    #[test]
    fn push_msg_correctly_formatted() {
        let localized_message = event().to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        assert_eq!(localized_message.title, "Inactivity fee notice");
        assert_eq!(
            localized_message.body,
            "Your Blink account has had no activity for 12 months. From 2026-10-15, $1 per balance per month applies. Open Blink once to stay active — any fee charged is refunded in full."
        );
    }

    #[test]
    fn bulletin_msg_correctly_formatted() {
        let locale = GaloyLocale::from("en".to_string());
        let persistent = event().to_localized_persistent_message(locale.clone());
        assert_eq!(persistent.title, "Inactivity fee notice");
        assert_eq!(
            persistent.body,
            "Inactivity fee: from 2026-10-15, $1 per balance per month applies to this account. Use it once to stay active — any fee charged is refunded in full."
        );
        assert_eq!(persistent.locale, locale);
    }

    #[test]
    fn untranslated_locales_fall_back_to_en() {
        let en = event().to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        let es = event().to_localized_push_msg(&GaloyLocale::from("es".to_string()));
        assert_eq!(es.title, en.title);
        assert_eq!(es.body, en.body);

        let en_bulletin =
            event().to_localized_persistent_message(GaloyLocale::from("en".to_string()));
        let es_bulletin =
            event().to_localized_persistent_message(GaloyLocale::from("es".to_string()));
        assert_eq!(es_bulletin.title, en_bulletin.title);
        assert_eq!(es_bulletin.body, en_bulletin.body);
    }

    #[test]
    fn delivered_as_admin_notification_with_push_history_and_bulletin() {
        let event = event();
        assert!(event.should_send_push());
        assert!(event.should_be_added_to_history());
        assert!(event.should_be_added_to_bulletin());
        assert!(event.action().is_none());
        assert!(matches!(
            event.category(),
            UserNotificationCategory::AdminNotification
        ));
    }
}
