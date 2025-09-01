
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

# Full admin access with all permissions
login_admin() {
  local scopes='["VIEW_ACCOUNTS","VIEW_TRANSACTIONS","MODIFY_ACCOUNTS","DELETE_ACCOUNTS","SEND_NOTIFICATIONS","SYSTEM_CONFIG"]'
  _create_admin_client_and_token "$scopes" "admin.token"
}

# Modify user access (can view and modify accounts/transactions, but no notifications or system config)
login_support_user() {
  local scopes='["VIEW_ACCOUNTS","VIEW_TRANSACTIONS","MODIFY_ACCOUNTS","DELETE_ACCOUNTS","SEND_NOTIFICATIONS"]'
  _create_admin_client_and_token "$scopes" "support_user.token"
}

# View-only access (can only view accounts and transactions)
login_view_user() {
  local scopes='["VIEW_ACCOUNTS","VIEW_TRANSACTIONS"]'
  _create_admin_client_and_token "$scopes" "view_user.token"
}
