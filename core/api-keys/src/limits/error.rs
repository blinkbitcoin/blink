use thiserror::Error;

#[derive(Error, Debug)]
pub enum LimitError {
    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("Invalid limit amount (must be positive)")]
    InvalidLimitAmount,

    #[error("Missing transaction id for ephemeral finalization")]
    MissingTransactionId,

    #[error("{0} spending limit exceeded")]
    LimitExceeded(String),

    #[error("Ephemeral reservation not found: {0}")]
    EphemeralNotFound(String),
}
