use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default = "default_api_key_auth_header")]
    pub api_key_auth_header: String,
    #[serde(default = "default_jwks_url")]
    pub jwks_url: String,
    #[serde(default = "default_internal_auth_secret")]
    pub internal_auth_secret: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            api_key_auth_header: default_api_key_auth_header(),
            jwks_url: default_jwks_url(),
            internal_auth_secret: default_internal_auth_secret(),
        }
    }
}

fn default_port() -> u16 {
    5397
}

fn default_api_key_auth_header() -> String {
    "X-API-KEY".to_string()
}

fn default_jwks_url() -> String {
    "http://localhost:4456/.well-known/jwks.json".to_string()
}

fn default_internal_auth_secret() -> String {
    "dev-only-insecure-secret".to_string()
}
