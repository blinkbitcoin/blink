
HYDRA_PUBLIC_API="http://localhost:4444"
HYDRA_ADMIN_API="http://localhost:4445"

# Address of the admin API upstream (the `admin-backend` oathkeeper rule proxies
# to bats-tests:4001, i.e. this host). Used to exercise the API's own token
# validation without going through oathkeeper.
CORE_ADMIN_API="${CORE_ADMIN_API:-http://localhost:4001}"

# Key oathkeeper signs id_tokens with in dev (see dev/config/ory/oathkeeper.yml).
# The admin API fetches its public half from oathkeeper's /.well-known/jwks.json.
OATHKEEPER_DEV_JWKS="${OATHKEEPER_DEV_JWKS:-${REPO_ROOT}/dev/config/ory/jwks.json}"

ADMIN_JWT_AUDIENCE="galoy-admin"
ALL_ADMIN_SCOPES='VIEW_ACCOUNTS VIEW_TRANSACTIONS DELETE_ACCOUNTS SEND_NOTIFICATIONS SYSTEM_CONFIG APPROVE_MERCHANT CHANGECONTACTS_ACCOUNT CHANGELEVEL_ACCOUNT LOCK_ACCOUNT VIEW_MERCHANTS MIGRATION_RETRY_GRANT'

# Sign a JWT with the dev oathkeeper key for tests that call the admin API
# directly.
#
#   mint_admin_jwt <sub> <scope> [aud]
#
# Omit `aud` to mint a token without an audience claim.
mint_admin_jwt() {
  local sub="$1"
  local scope="$2"
  local aud="${3:-}"

  node -e '
    const crypto = require("crypto")
    const fs = require("fs")
    const [jwksPath, sub, scope, aud] = process.argv.slice(1)

    const jwk = JSON.parse(fs.readFileSync(jwksPath, "utf8")).keys[0]
    const key = crypto.createPrivateKey({ key: jwk, format: "jwk" })

    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url")
    const now = Math.floor(Date.now() / 1000)

    const header = { alg: "RS256", typ: "JWT", kid: jwk.kid }
    const payload = { sub, scope, iss: "galoy.io", iat: now, exp: now + 3600 }
    if (aud) payload.aud = aud

    const signingInput = `${b64(header)}.${b64(payload)}`
    const signature = crypto.sign("sha256", Buffer.from(signingInput), key).toString("base64url")
    process.stdout.write(`${signingInput}.${signature}`)
  ' "$OATHKEEPER_DEV_JWKS" "$sub" "$scope" "$aud"
}

# POST an admin graphql query straight to the admin API upstream, presenting the
# JWT the way oathkeeper would have forwarded it. Sets `output` (body) like the
# other exec_* helpers so `graphql_output` works, plus `http_code`.
exec_admin_graphql_direct() {
  local token=$1
  local query_name=$2
  local variables=${3:-"{}"}
  echo "Direct admin GQL query - query: ${query_name} - vars: ${variables}"

  local response
  response=$(curl -s \
    -w $'\n%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$(gql_admin_query $query_name)\", \"variables\": $variables}" \
    "${CORE_ADMIN_API}/graphql")

  http_code="${response##*$'\n'}"
  output="${response%$'\n'*}"
  echo "http_code: ${http_code}"
  echo "${output}"
}

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
  _create_admin_client_and_token "$ALL_ADMIN_SCOPES" "admin.token"
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


