use thiserror::Error;

#[derive(Error, Debug)]
pub enum LimitError {
    #[error("Database error: {0}")]
    Sqlx(#[from] sqlx::Error),

    #[error("Invalid limit amount (must be positive)")]
    InvalidLimitAmount,
}
