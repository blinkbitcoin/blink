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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Authorization {
    pub can_write: bool,
    pub can_manage_keys: bool,
}

// Empty scope is trusted only for Kratos sessions; key management needs a session or OAuth write.
pub fn authorize(scope: &str, session_id: &str, client_id: &str) -> Authorization {
    let is_session = !session_id.is_empty();
    let is_oauth = !is_session && !client_id.is_empty();
    let has_write = scope.split(' ').any(|s| s == WRITE_SCOPE);
    let can_write = has_write || (is_session && scope.is_empty());
    Authorization {
        can_write,
        can_manage_keys: is_session || (is_oauth && has_write),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SESSION: &str = "9b8c7d6e-session";
    const CLIENT: &str = "dashboard-client";

    fn auth(can_write: bool, can_manage_keys: bool) -> Authorization {
        Authorization {
            can_write,
            can_manage_keys,
        }
    }

    #[test]
    fn mobile_session() {
        assert_eq!(authorize("", SESSION, ""), auth(true, true));
    }

    #[test]
    fn dashboard_oauth_with_write() {
        assert_eq!(authorize("read write", "", CLIENT), auth(true, true));
    }

    #[test]
    fn oauth_read_only() {
        assert_eq!(authorize("read", "", CLIENT), auth(false, false));
    }

    #[test]
    fn oauth_empty_scope() {
        assert_eq!(authorize("", "", CLIENT), auth(false, false));
    }

    #[test]
    fn write_api_key() {
        assert_eq!(authorize("read write", "", ""), auth(true, false));
    }

    #[test]
    fn read_or_receive_api_key() {
        assert_eq!(authorize("read", "", ""), auth(false, false));
        assert_eq!(authorize("receive", "", ""), auth(false, false));
    }

    #[test]
    fn anonymous() {
        assert_eq!(authorize("", "", ""), auth(false, false));
    }
}
