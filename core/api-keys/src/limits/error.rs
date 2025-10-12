use thiserror::Error;

#[derive(Error, Debug)]
pub enum LimitError {
    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("Negative amount not allowed")]
    NegativeAmount,

    #[error("Amount must be positive")]
    NonPositiveAmount,

    #[error("Invalid limit value (must be positive)")]
    InvalidLimit,
}
