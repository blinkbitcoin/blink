use rust_i18n::t;
use serde::{Deserialize, Serialize};

use super::NotificationEvent;
use crate::{messages::*, primitives::*};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum TransactionType {
    IntraLedgerReceipt,
    IntraLedgerPayment,
    OnchainReceipt,
    OnchainReceiptPending,
    OnchainPayment,
    LightningReceipt,
    LightningPayment,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionAmount {
    pub minor_units: u64,
    pub fraction_digits: Option<u32>,
    pub currency: Currency,
}

impl std::fmt::Display for TransactionAmount {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.currency
            .format_minor_units(f, self.minor_units, false, self.fraction_digits)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionOccurred {
    pub transaction_type: TransactionType,
    pub settlement_amount: TransactionAmount,
    pub display_amount: Option<TransactionAmount>,
}

impl NotificationEvent for TransactionOccurred {
    fn category(&self) -> UserNotificationCategory {
        UserNotificationCategory::Payments
    }

    fn should_send_push(&self) -> bool {
        true
    }

    fn to_localized_push_msg(&self, locale: &GaloyLocale) -> LocalizedPushMessage {
        let txn_type = match self.transaction_type {
            TransactionType::IntraLedgerPayment => "transaction.intra_ledger_payment",
            TransactionType::IntraLedgerReceipt => "transaction.intra_ledger_receipt",
            TransactionType::OnchainPayment => "transaction.onchain_payment",
            TransactionType::OnchainReceipt => "transaction.onchain_receipt",
            TransactionType::OnchainReceiptPending => "transaction.onchain_receipt_pending",
            TransactionType::LightningPayment => "transaction.lightning_payment",
            TransactionType::LightningReceipt => "transaction.lightning_receipt",
        };

        let title_key = format!("{}.title", txn_type);
        let body_key = format!("{}.body", txn_type);
        let body_display_currency_key = format!("{}.body_display_currency", txn_type);

        let title = t!(
            title_key.as_str(),
            locale = locale.as_ref(),
            walletCurrency = self.settlement_amount.currency,
        )
        .to_string();

        let body = match &self.display_amount {
            Some(display_amount) if display_amount.currency != self.settlement_amount.currency => {
                t!(
                    body_display_currency_key.as_str(),
                    locale = locale.as_ref(),
                    formattedCurrencyAmount = self.settlement_amount.to_string(),
                    displayCurrencyAmount = display_amount.to_string(),
                )
                .to_string()
            }
            _ => t!(
                body_key.as_str(),
                locale = locale.as_ref(),
                formattedCurrencyAmount = self.settlement_amount.to_string(),
            )
            .to_string(),
        };

        LocalizedPushMessage { title, body }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn intra_ledger_payment_push_message() {
        let event = TransactionOccurred {
            transaction_type: TransactionType::IntraLedgerPayment,
            settlement_amount: TransactionAmount {
                minor_units: 100,
                fraction_digits: None,
                currency: Currency::Iso(rusty_money::iso::USD),
            },
            display_amount: None,
        };
        let localized_message = event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        assert_eq!(localized_message.title, "USD Transaction");
        assert_eq!(localized_message.body, "Sent payment of $1.00");
    }

    #[test]
    fn intra_ledger_payment_receipt_message() {
        let event = TransactionOccurred {
            transaction_type: TransactionType::IntraLedgerReceipt,
            settlement_amount: TransactionAmount {
                minor_units: 1,
                fraction_digits: None,
                currency: Currency::Crypto(rusty_money::crypto::BTC),
            },
            display_amount: Some(TransactionAmount {
                minor_units: 4,
                fraction_digits: None,
                currency: Currency::Iso(rusty_money::iso::USD),
            }),
        };
        let localized_message = event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
        assert_eq!(localized_message.title, "BTC Transaction");
        assert_eq!(localized_message.body, "+$0.04 | 1 sats");
    }

    #[test]
    fn huf_display_currency_formats_correctly() {
        // Regression test for https://github.com/blinkbitcoin/blink-mobile/issues/3234
        // HUF has ISO exponent 0, but system tracks amounts in fillér (1/100 HUF)
        // 366519 fillér should display as 3665.19Ft, not 366519Ft
        for fraction_digits in [None, Some(2)] {
            let event = TransactionOccurred {
                transaction_type: TransactionType::LightningReceipt,
                settlement_amount: TransactionAmount {
                    minor_units: 1,
                    fraction_digits: None,
                    currency: Currency::Crypto(rusty_money::crypto::BTC),
                },
                display_amount: Some(TransactionAmount {
                    minor_units: 366519,
                    fraction_digits,
                    currency: Currency::Iso(rusty_money::iso::HUF),
                }),
            };
            let localized_message =
                event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
            assert!(
                localized_message.body.contains("3665.19Ft"),
                "HUF amount should be divided by 100. Got: {}",
                localized_message.body
            );
        }
    }

    #[test]
    fn huf_non_two_digit_scales_bypass_the_filler_carve_out() {
        // The internal two-decimal contract applies only when the sender
        // confirms two digits or omits the field. Any other explicit scale goes
        // through the generic branch with the supplied exponent.
        // rusty_money formats HUF in its own locale: space-grouped integer part,
        // comma decimal separator. Some(0) renders 366 519Ft, Some(3) 366,519Ft.
        let cases: [(Option<u32>, &str); 2] = [(Some(0), "366 519Ft"), (Some(3), "366,519Ft")];
        for (fraction_digits, expected_digits) in cases {
            let event = TransactionOccurred {
                transaction_type: TransactionType::LightningReceipt,
                settlement_amount: TransactionAmount {
                    minor_units: 1,
                    fraction_digits: None,
                    currency: Currency::Crypto(rusty_money::crypto::BTC),
                },
                display_amount: Some(TransactionAmount {
                    minor_units: 366519,
                    fraction_digits,
                    currency: Currency::Iso(rusty_money::iso::HUF),
                }),
            };
            let localized_message =
                event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
            assert!(
                localized_message.body.contains(expected_digits),
                "HUF at {fraction_digits:?} should render {expected_digits} digits. Got: {}",
                localized_message.body
            );
            assert!(
                !localized_message.body.contains("3665.19Ft"),
                "the two-decimal carve-out must not apply at {fraction_digits:?}. Got: {}",
                localized_message.body
            );
        }
    }

    #[test]
    fn configured_fraction_digits_override_iso_exponent() {
        // Each case must discriminate the override branch from the ISO fallback:
        // the supplied digits differ from the currency's native ISO exponent.
        let cases: [(
            &'static rusty_money::iso::Currency,
            Option<u32>,
            &str,
            Option<&str>,
        ); 4] = [
            // USD native exponent 2: an explicit zero-digit scale must render
            // whole dollars, never 1.00.
            (rusty_money::iso::USD, Some(0), "$100", Some("$1.00")),
            // Control: without the field the ISO exponent formats 1.00.
            (rusty_money::iso::USD, None, "$1.00", None),
            // JPY native exponent 0: an explicit two-digit scale must render 1.00.
            (rusty_money::iso::JPY, Some(2), "1.00", None),
            // Zero-digit scale on a zero-exponent ISO currency.
            (rusty_money::iso::XTS, Some(0), "100", None),
        ];
        for (currency, fraction_digits, expected, unexpected) in cases {
            let event = TransactionOccurred {
                transaction_type: TransactionType::LightningReceipt,
                settlement_amount: TransactionAmount {
                    minor_units: 1,
                    fraction_digits: None,
                    currency: Currency::Crypto(rusty_money::crypto::BTC),
                },
                display_amount: Some(TransactionAmount {
                    minor_units: 100,
                    fraction_digits,
                    currency: Currency::Iso(currency),
                }),
            };
            let localized_message =
                event.to_localized_push_msg(&GaloyLocale::from("en".to_string()));
            assert!(
                localized_message.body.contains(expected),
                "{} at {fraction_digits:?} should contain {expected}. Got: {}",
                currency.iso_alpha_code,
                localized_message.body
            );
            if let Some(unexpected) = unexpected {
                assert!(
                    !localized_message.body.contains(unexpected),
                    "{} at {fraction_digits:?} must not contain {unexpected}. Got: {}",
                    currency.iso_alpha_code,
                    localized_message.body
                );
            }
        }
    }

    #[test]
    fn persisted_payload_without_fraction_digits_defaults_to_none() {
        // mq_payloads rows written before fraction_digits existed must keep
        // deserialising, with the field defaulting to None.
        let payload = r#"{"minor_units":100,"currency":"USD"}"#;
        let amount: TransactionAmount = serde_json::from_str(payload).expect("legacy payload");
        assert_eq!(amount.minor_units, 100);
        assert_eq!(amount.fraction_digits, None);
    }
}
