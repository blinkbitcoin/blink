use axum::http::header::ToStrError;
use thiserror::Error;

use crate::identity::IdentityError;
use crate::limits::LimitError;

#[derive(Error, Debug)]
pub enum ApplicationError {
    #[error("scopes can not be empty")]
    MissingScopes,
    #[error("ApplicationError - MissingApiKey")]
    MissingApiKey,
    #[error("ApplicationError - BadKeyFormat: {0}")]
    BadKeyFormat(#[from] ToStrError),
    #[error("ApplicationError - Sqlx: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("ApplicationError - IdentityError: {0}")]
    Identity(#[from] IdentityError),
    #[error("ApplicationError - LimitError: {0}")]
    Limit(#[from] LimitError),
}
