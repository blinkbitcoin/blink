const READ_SCOPE: &str = "read";
const WRITE_SCOPE: &str = "write";
const RECEIVE_SCOPE: &str = "receive";

#[derive(async_graphql::Enum, Copy, Clone, Eq, PartialEq, Debug)]
pub enum Scope {
    Read,
    Write,
    Receive,
}

impl std::fmt::Display for Scope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Scope::Read => write!(f, "{}", READ_SCOPE),
            Scope::Write => write!(f, "{}", WRITE_SCOPE),
            Scope::Receive => write!(f, "{}", RECEIVE_SCOPE),
        }
    }
}

impl std::str::FromStr for Scope {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            READ_SCOPE => Ok(Scope::Read),
            WRITE_SCOPE => Ok(Scope::Write),
            RECEIVE_SCOPE => Ok(Scope::Receive),
            _ => Err(format!("Invalid scope: {}", s)),
        }
    }
}

pub fn is_read_only(scope: &[Scope]) -> bool {
    scope.len() == 1 && scope[0] == Scope::Read
}

// Key management needs a Kratos session or an OAuth token with write scope.
pub fn can_manage_keys(scope: &str, session_id: &str, client_id: &str) -> bool {
    if !session_id.is_empty() {
        return true;
    }
    !client_id.is_empty() && scope.split(' ').any(|s| s == WRITE_SCOPE)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "9b8c7d6e-session";
    const CLIENT: &str = "dashboard-client";

    #[test]
    fn mobile_session() {
        assert!(can_manage_keys("", SESSION, ""));
    }

    #[test]
    fn dashboard_oauth_with_write() {
        assert!(can_manage_keys("read write", "", CLIENT));
    }

    #[test]
    fn oauth_read_only() {
        assert!(!can_manage_keys("read", "", CLIENT));
    }

    #[test]
    fn oauth_empty_scope() {
        assert!(!can_manage_keys("", "", CLIENT));
    }

    #[test]
    fn write_api_key() {
        assert!(!can_manage_keys("read write", "", ""));
    }

    #[test]
    fn read_or_receive_api_key() {
        assert!(!can_manage_keys("read", "", ""));
        assert!(!can_manage_keys("receive", "", ""));
    }

    #[test]
    fn anonymous() {
        assert!(!can_manage_keys("", "", ""));
    }
}
