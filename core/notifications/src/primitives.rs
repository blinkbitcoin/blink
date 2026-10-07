use serde::{Deserialize, Serialize};

#[derive(Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
pub struct GaloyUserId(String);
impl GaloyUserId {
    pub fn search_begin() -> Self {
        GaloyUserId(String::new())
    }

    pub fn into_inner(self) -> String {
        self.0
    }
}

impl From<String> for GaloyUserId {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl AsRef<str> for GaloyUserId {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GaloyUserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

es_entity::entity_id! { UserNotificationSettingsId }
es_entity::entity_id! { StatefulNotificationId }

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Hash)]
pub struct GaloyLocale(String);

impl Default for GaloyLocale {
    fn default() -> Self {
        Self("en".to_string())
    }
}

impl From<String> for GaloyLocale {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl AsRef<str> for GaloyLocale {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GaloyLocale {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Hash)]
pub struct PushDeviceToken(String);
impl PushDeviceToken {
    pub fn into_inner(self) -> String {
        self.0
    }
}
impl From<String> for PushDeviceToken {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl AsRef<str> for PushDeviceToken {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for PushDeviceToken {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Serialize, Deserialize, Hash)]
pub struct GaloyEmailAddress(String);
impl GaloyEmailAddress {
    pub fn into_inner(self) -> String {
        self.0
    }
}
impl From<String> for GaloyEmailAddress {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl AsRef<str> for GaloyEmailAddress {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for GaloyEmailAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

// Mirrored in core/api/src/domain/notifications/index.ts (BulletinKeyMaxLength)
pub const BULLETIN_KEY_MAX_LENGTH: usize = 100;
// Mirrored in core/api/src/domain/notifications/index.ts (NotificationBulletinsMaxUserIds)
pub const LATEST_BULLETINS_MAX_USER_IDS: usize = 100;

#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Debug, Serialize, Deserialize, Hash)]
pub struct BulletinKey(String);

impl BulletinKey {
    pub fn into_inner(self) -> String {
        self.0
    }

    fn is_valid(key: &str) -> bool {
        let is_separator = |c: char| c == '-' || c == '_';
        let is_slug_char = |c: char| c.is_ascii_lowercase() || c.is_ascii_digit();
        let has_valid_length = key.len() <= BULLETIN_KEY_MAX_LENGTH;
        let has_valid_segments = key
            .split(is_separator)
            .all(|segment| !segment.is_empty() && segment.chars().all(is_slug_char));
        has_valid_length && has_valid_segments
    }
}

impl TryFrom<String> for BulletinKey {
    type Error = String;

    fn try_from(key: String) -> Result<Self, Self::Error> {
        let normalized = key.trim().to_ascii_lowercase();
        if !Self::is_valid(&normalized) {
            return Err(format!("Invalid bulletin key: '{}'", key));
        }
        Ok(Self(normalized))
    }
}

impl AsRef<str> for BulletinKey {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for BulletinKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(async_graphql::Enum, Debug, Copy, Clone, Eq, PartialEq, Deserialize, Serialize)]
#[graphql(name = "UserNotificationChannel")]
pub enum UserNotificationChannel {
    Push,
}

#[derive(async_graphql::Enum, Debug, Hash, Copy, Clone, Eq, PartialEq, Deserialize, Serialize)]
#[graphql(name = "UserNotificationCategory")]
pub enum UserNotificationCategory {
    Circles,
    Payments,
    AdminNotification,
    Marketing,
    Price,
    Security,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum CircleType {
    Inner,
    Outer,
}

impl std::fmt::Display for CircleType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircleType::Inner => write!(f, "inner"),
            CircleType::Outer => write!(f, "outer"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum CircleTimeFrame {
    Month,
    AllTime,
}

impl std::fmt::Display for CircleTimeFrame {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircleTimeFrame::Month => write!(f, "month"),
            CircleTimeFrame::AllTime => write!(f, "all_time"),
        }
    }
}

#[derive(Debug, Clone, Copy, Eq, Serialize, Deserialize)]
#[serde(try_from = "String")]
#[serde(into = "&str")]
pub enum Currency {
    Iso(&'static rusty_money::iso::Currency),
    Crypto(&'static rusty_money::crypto::Currency),
}

impl Currency {
    pub fn code(&self) -> &'static str {
        match self {
            Currency::Iso(c) => c.iso_alpha_code,
            Currency::Crypto(c) => c.code,
        }
    }

    /// Checks if a currency has ISO 4217 exponent 0 but the system tracks amounts
    /// with 2 decimal places internally. The carve-out applies only when the
    /// sender confirms the two-decimal scale (`Some(2)`) or omits the field
    /// entirely, which is the shape of replayed pre-`fraction_digits` payloads.
    ///
    /// Examples:
    /// - HUF (Hungarian Forint): ISO exponent 0, but the system tracks fillér
    ///   (1/100 HUF), so 366519 minor units must display as 3665.19Ft, not
    ///   366519Ft. See https://github.com/blinkbitcoin/blink-mobile/issues/3234
    ///
    /// TODO: once every producer sends `fraction_digits`, this carve-out is
    /// redundant with the generic explicit-scale branch and can be deleted.
    fn tracks_minor_units_at_two_decimals(&self) -> bool {
        match self {
            Currency::Iso(c) => {
                // Currencies with exponent 0 where the system tracks sub-units
                matches!(c.iso_alpha_code, "HUF")
            }
            Currency::Crypto(_) => false,
        }
    }

    pub fn format_minor_units(
        &self,
        f: &mut std::fmt::Formatter<'_>,
        minor_units: u64,
        round_to_major: bool,
        fraction_digits: Option<u32>,
    ) -> std::fmt::Result {
        match self {
            Currency::Iso(c) => {
                // Preserve the existing HUF representation when core explicitly
                // confirms the internal two-decimal contract.
                if self.tracks_minor_units_at_two_decimals()
                    && c.exponent == 0
                    && fraction_digits.unwrap_or(2) == 2
                {
                    let major = minor_units / 100;
                    let cents = minor_units % 100;
                    return write!(f, "{}.{:02}{}", major, cents, c.symbol);
                }

                if let Some(exponent) = fraction_digits {
                    let configured_currency = rusty_money::iso::Currency { exponent, ..**c };
                    let money =
                        rusty_money::Money::from_minor(minor_units as i64, &configured_currency);
                    let money = if round_to_major {
                        money.round(0, rusty_money::Round::HalfUp)
                    } else {
                        money
                    };
                    return write!(f, "{money}");
                }

                let money = if round_to_major {
                    rusty_money::Money::from_minor(minor_units as i64, *c)
                        .round(0, rusty_money::Round::HalfUp)
                } else {
                    rusty_money::Money::from_minor(minor_units as i64, *c)
                };

                write!(f, "{money}")
            }
            Currency::Crypto(c) if c == &rusty_money::crypto::BTC => {
                write!(f, "{} sats", minor_units as f64)
            }
            _ => unimplemented!("format_minor_units for currency: {}", self.code()),
        }
    }
}

impl std::fmt::Display for Currency {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code())
    }
}

impl std::hash::Hash for Currency {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.code().hash(state);
    }
}

impl PartialEq for Currency {
    fn eq(&self, other: &Self) -> bool {
        self.code() == other.code()
    }
}

impl std::str::FromStr for Currency {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match rusty_money::iso::find(s) {
            Some(c) => Ok(Currency::Iso(c)),
            _ => match rusty_money::crypto::find(s) {
                Some(c) => Ok(Currency::Crypto(c)),
                _ => Err(format!("Unknown currency: '{}'", s)),
            },
        }
    }
}

impl TryFrom<String> for Currency {
    type Error = String;

    fn try_from(s: String) -> Result<Self, Self::Error> {
        s.parse()
    }
}

impl From<Currency> for &'static str {
    fn from(c: Currency) -> Self {
        c.code()
    }
}

#[derive(Debug, Clone)]
pub struct ReadPool(sqlx::PgPool);
impl ReadPool {
    pub fn inner(&self) -> &sqlx::PgPool {
        &self.0
    }
}
impl From<sqlx::PgPool> for ReadPool {
    fn from(pool: sqlx::PgPool) -> Self {
        Self(pool)
    }
}

#[cfg(test)]
mod bulletin_key_tests {
    use super::*;

    fn checked(key: &str) -> Result<BulletinKey, String> {
        BulletinKey::try_from(key.to_string())
    }

    #[test]
    fn valid_slug_passes() {
        let key = checked("feature-rollout_2").expect("should be valid");
        assert_eq!(key.as_ref(), "feature-rollout_2");
    }

    #[test]
    fn key_is_trimmed_and_lowercased() {
        let key = checked("  Feature-Rollout  ").expect("should be valid");
        assert_eq!(key.as_ref(), "feature-rollout");
    }

    #[test]
    fn key_at_max_length_passes() {
        let key = "a".repeat(BULLETIN_KEY_MAX_LENGTH);
        assert!(checked(&key).is_ok());
    }

    #[test]
    fn key_over_max_length_fails() {
        let key = "a".repeat(BULLETIN_KEY_MAX_LENGTH + 1);
        assert!(checked(&key).is_err());
    }

    #[test]
    fn empty_key_fails() {
        assert!(checked("").is_err());
        assert!(checked("   ").is_err());
    }

    #[test]
    fn key_with_invalid_chars_fails() {
        assert!(checked("feature rollout").is_err());
        assert!(checked("feature.rollout").is_err());
        assert!(checked("feature/rollout").is_err());
        assert!(checked("función").is_err());
    }

    #[test]
    fn key_with_misplaced_separators_fails() {
        assert!(checked("-feature").is_err());
        assert!(checked("feature_").is_err());
        assert!(checked("feature--rollout").is_err());
        assert!(checked("feature-_rollout").is_err());
    }

    #[test]
    fn invalid_key_error_includes_original_value() {
        let err = checked("Bad Key").expect_err("should be invalid");
        assert!(err.contains("Bad Key"));
    }
}
