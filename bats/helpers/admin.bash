
HYDRA_PUBLIC_API="http://localhost:4444"
HYDRA_ADMIN_API="http://localhost:4445"

# Helper function to create a client and get token with specified scopes
_create_admin_client_and_token() {
  local scopes="$1"
  local token_cache_key="$2"

  # Create the JSON payload properly
  local json_payload=$(jq -n \
    --arg scopes "$scopes" \
    '{
      "grant_types": ["client_credentials"],
      "scope": $scopes
    }')

  client=$(curl -L -s -X POST $HYDRA_ADMIN_API/admin/clients \
    -H 'Content-Type: application/json' \
    -d "$json_payload")

  client_id=$(echo "$client" | jq -r '.client_id')
  client_secret=$(echo "$client" | jq -r '.client_secret')

  token=$(curl -s -X POST $HYDRA_PUBLIC_API/oauth2/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -u "$client_id:$client_secret" \
  -d "grant_type=client_credentials&scope=$scopes" | jq -r '.access_token'
  )
  echo "${token_cache_key}: $token"
  [[ -n "$token" && "$token" != "null" ]] || exit 1
  cache_value "$token_cache_key" "$token"
}

# Below user specification is mimicking the users as they are defined in apps/admin-panel/app/api/auth/[...nextauth]/options.ts

# ADMIN role - Full system access
login_admin() {
  local scopes='VIEW_ACCOUNTS VIEW_TRANSACTIONS DELETE_ACCOUNTS SEND_NOTIFICATIONS SYSTEM_CONFIG APPROVE_MERCHANT CHANGECONTACTS_ACCOUNT CHANGELEVEL_ACCOUNT LOCK_ACCOUNT VIEW_MERCHANTS'
  _create_admin_client_and_token "$scopes" "admin.token"
}

# SUPPORTLV2 role - Advanced support operations (all SUPPORTLV1 + change contacts and levels)
login_supportlv2_user() {
  local scopes='VIEW_ACCOUNTS VIEW_TRANSACTIONS VIEW_MERCHANTS LOCK_ACCOUNT APPROVE_MERCHANT CHANGECONTACTS_ACCOUNT CHANGELEVEL_ACCOUNT'
  _create_admin_client_and_token "$scopes" "supportlv2_user.token"
}

# SUPPORTLV1 role - Basic support operations (view accounts/merchants, lock accounts, approve merchants)
login_supportlv1_user() {
  local scopes='VIEW_ACCOUNTS VIEW_TRANSACTIONS VIEW_MERCHANTS LOCK_ACCOUNT APPROVE_MERCHANT'
  _create_admin_client_and_token "$scopes" "supportlv1_user.token"
}

# MARKETING role - Can send notifications only
login_marketing_user() {
  local scopes='SEND_NOTIFICATIONS'
  _create_admin_client_and_token "$scopes" "marketing_user.token"
}

# VIEWER role - Read-only access (can view accounts, transactions, and merchants)
login_viewer_user() {
  local scopes='VIEW_ACCOUNTS VIEW_TRANSACTIONS VIEW_MERCHANTS'
  _create_admin_client_and_token "$scopes" "viewer_user.token"
}


