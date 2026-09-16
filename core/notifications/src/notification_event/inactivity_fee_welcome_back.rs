use rust_i18n::t;
use serde::{Deserialize, Serialize};

use super::{NotificationEvent, TransactionAmount};
use crate::{messages::*, primitives::*};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InactivityFeeWelcomeBack {
    /// Amounts refunded per balance, never blended. `None` and `0` both mean "nothing refunded
    /// on that balance"; the template renders whichever is set, both when both are.
    pub refunded_sats: Option<u64>,
    pub refunded_cents: Option<u64>,
}

impl InactivityFeeWelcomeBack {
    fn refunded_amount(&self) -> String {
        let mut parts = Vec::new();
        if let Some(sats) = self.refunded_sats.filter(|sats| *sats > 0) {
            parts.push(format_minor_units("BTC", sats));
        }
        if let Some(cents) = self.refunded_cents.filter(|cents| *cents > 0) {
            parts.push(format_minor_units("USD", cents));
        }
        if parts.is_empty() {
            // unreachable through the gRPC boundary (it rejects an event with no amount)
            return format_minor_units("USD", 0);
        }
        parts.join(" and ")
    }
}

fn format_minor_units(currency_code: &str, minor_units: u64) -> String {
    let currency = currency_code
        .parse::<Currency>()
        .expect("BTC and USD are known currencies");
    TransactionAmount {
        minor_units,
        fraction_digits: None,
        currency,
    }
    .to_string()
}

impl NotificationEvent for InactivityFeeWelcomeBack {
    fn category(&self) -> UserNotificationCategory {
        UserNotificationCategory::AdminNotification
    }

    fn should_be_added_to_history(&self) -> bool {
        true
    }

    fn should_be_added_to_bulletin(&self) -> bool {
        true
    }

    fn to_localized_persistent_message(&self, locale: GaloyLocale) -> LocalizedStatefulMessage {
        let title = t!(
            "inactivity_fee_welcome_back.title",
            locale = locale.as_ref()
        )
        .to_string();
        let body = t!(
            "inactivity_fee_welcome_back.body",
            locale = locale.as_ref(),
            amount = self.refunded_amount()
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

    fn body(refunded_sats: Option<u64>, refunded_cents: Option<u64>) -> String {
        InactivityFeeWelcomeBack {
            refunded_sats,
            refunded_cents,
        }
        .to_localized_persistent_message(GaloyLocale::from("en".to_string()))
        .body
    }

    #[test]
    fn renders_sats_only() {
        assert_eq!(
            body(Some(300), None),
            "Welcome back. Your account is active again and the inactivity fee of 300 sats has been refunded to your balance."
        );
    }

    #[test]
    fn renders_cents_only() {
        assert_eq!(
            body(None, Some(60)),
            "Welcome back. Your account is active again and the inactivity fee of $0.60 has been refunded to your balance."
        );
    }

    #[test]
    fn renders_both_when_both_refunded() {
        assert_eq!(
            body(Some(300), Some(60)),
            "Welcome back. Your account is active again and the inactivity fee of 300 sats and $0.60 has been refunded to your balance."
        );
    }

    #[test]
    fn zero_counts_as_absent() {
        assert_eq!(body(Some(0), Some(60)), body(None, Some(60)));
        assert_eq!(body(Some(300), Some(0)), body(Some(300), None));
    }

    #[test]
    fn untranslated_locales_fall_back_to_en() {
        let event = InactivityFeeWelcomeBack {
            refunded_sats: Some(300),
            refunded_cents: None,
        };
        let en = event.to_localized_persistent_message(GaloyLocale::from("en".to_string()));
        let es = event.to_localized_persistent_message(GaloyLocale::from("es".to_string()));
        assert_eq!(es.title, en.title);
        assert_eq!(es.body, en.body);
        assert_eq!(en.title, "Welcome back");
    }

    #[test]
    fn delivered_as_admin_notification_with_history_and_bulletin_no_push() {
        let event = InactivityFeeWelcomeBack {
            refunded_sats: Some(1),
            refunded_cents: None,
        };
        assert!(!event.should_send_push());
        assert!(event.should_be_added_to_history());
        assert!(event.should_be_added_to_bulletin());
        assert!(event.action().is_none());
        assert!(matches!(
            event.category(),
            UserNotificationCategory::AdminNotification
        ));
    }
}
