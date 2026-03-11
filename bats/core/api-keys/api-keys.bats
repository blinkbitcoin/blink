#!/usr/bin/env bats

load "../../helpers/user.bash"
load "../../helpers/subscriber.bash"

random_uuid() {
  if [[ -e /proc/sys/kernel/random/uuid ]]; then
    cat /proc/sys/kernel/random/uuid
  else
    uuidgen
  fi
}

new_key_name() {
  random_uuid
}

# Helper for concurrent tests: writes GraphQL output to a file instead of $output
exec_graphql_to_file() {
  local token_name=$1
  local query_name=$2
  local variables=${3:-"{}"}
  local output_file=$4

  local auth_header=""
  if [[ ${token_name} == "anon" ]]; then
    auth_header=""
  elif [[ ${token_name} == api-key* ]]; then
    auth_header="X-API-KEY: $(read_value "$token_name")"
  else
    auth_header="Authorization: Bearer $(read_value "$token_name")"
  fi

  curl -s -X POST \
    ${auth_header:+ -H "$auth_header"} \
    -H "Content-Type: application/json" \
    -H "X-Idempotency-Key: $(new_idempotency_key)" \
    -d "{\"query\": \"$(gql_query "$query_name")\", \"variables\": $variables}" \
    "${OATHKEEPER_PROXY}/graphql" > "$output_file"
}

@test "api-keys: create new key" {
  login_user 'alice' '+16505554350'

  exec_graphql 'alice' 'api-keys'
  initial_length="$(graphql_output '.data.me.apiKeys | length')"

  key_name="$(new_key_name)"
  cache_value 'key_name' $key_name

  variables="{\"input\":{\"name\":\"${key_name}\"}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"

  cache_value "api-key-secret" "$secret"

  name=$(echo "$key" | jq -r '.name')
  [[ "${name}" = "${key_name}" ]] || exit 1

  readOnly=$(echo "$key" | jq -r '.readOnly')
  [[ "${readOnly}" = "false" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-id" "$key_id"

  exec_graphql 'alice' 'api-keys'
  post_creation_length="$(graphql_output '.data.me.apiKeys | length')"

  # Check that the length has incremented by 1
  [[ "$((post_creation_length))" -eq "$((initial_length + 1))" ]] || exit 1

  exec_graphql 'alice' 'authorization'
  scopes="$(graphql_output '.data.authorization.scopes')"
  [[ "$scopes" =~ "READ" ]] || exit 1
  [[ "$scopes" =~ "WRITE" ]] || exit 1
  [[ "$scopes" =~ "RECEIVE" ]] || exit 1
}

@test "api-keys: can authenticate with api key and list keys" {
  exec_graphql 'api-key-secret' 'api-keys'

  keyName="$(graphql_output '.data.me.apiKeys[-1].name')"
  [[ "${keyName}" = "$(read_value 'key_name')" ]] || exit 1

  exec_graphql 'api-key-secret' 'authorization'
  scopes="$(graphql_output '.data.authorization.scopes')"
  [[ "$scopes" =~ "READ" ]] || exit 1
  [[ "$scopes" =~ "WRITE" ]] || exit 1
  [[ ! "$scopes" =~ "RECEIVE" ]] || exit 1
}

@test "api-keys: can subscribe" {
  subscribe_to 'api-key-secret' 'my-updates-sub'
  retry 10 1 grep 'Data' "${SUBSCRIBER_LOG_FILE}"
  if grep -q 'Data: {"errors"' "${SUBSCRIBER_LOG_FILE}"; then
    echo "errors found in the log file."
    exit 1
  fi
  stop_subscriber
}

@test "api-keys: can revoke key" {
  key_id=$(read_value "api-key-id")
  variables="{\"input\":{\"id\":\"${key_id}\"}}"

  exec_graphql 'alice' 'revoke-api-key' "$variables"
  revoked_from_response=$(graphql_output '.data.apiKeyRevoke.apiKey.revoked')
  [[ "${revoked_from_response}" = "true" ]] || exit 1

  exec_graphql 'alice' 'api-keys'
  revoked="$(graphql_output '.data.me.apiKeys[-1].revoked')"
  [[ "${revoked}" = "true" ]] || exit 1

  exec_graphql 'api-key-secret' 'api-keys'

  error="$(graphql_output '.error.code')"
  [[ "${error}" = "401" ]] || exit 1
}

@test "api-keys: can create read-only" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value "api-key-secret" "$secret"

  readOnly=$(echo "$key" | jq -r '.readOnly')
  [[ "${readOnly}" = "true" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-id" "$key_id"

  exec_graphql 'api-key-secret' 'api-keys'

  name="$(graphql_output '.data.me.apiKeys[] | select(.name == "'${key_name}'") | .name')"
  [[ "${name}" = "${key_name}" ]] || exit 1

  exec_graphql 'api-key-secret' 'authorization'
  scopes="$(graphql_output '.data.authorization.scopes')"
  [[ "$scopes" =~ "READ" ]] || exit 1
  [[ ! "$scopes" =~ "WRITE" ]] || exit 1
  [[ ! "$scopes" =~ "RECEIVE" ]] || exit 1
}

@test "api-keys: read-only key cannot mutate" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\"}}"
  exec_graphql 'api-key-secret' 'api-key-create' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1

  variables="{\"input\":{\"currency\":\"USD\"}}"
  exec_graphql 'api-key-secret' 'update-display-currency' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1

  # Sanity check that it works with alice
  exec_graphql 'alice' 'update-display-currency' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
}

@test "api-keys: receive can create on-chain address" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"RECEIVE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value "api-key-secret" "$secret"

  readOnly=$(echo "$key" | jq -r '.readOnly')
  [[ "${readOnly}" = "false" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-id" "$key_id"

  btc_wallet_name="alice.btc_wallet_id"
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    '{input: {walletId: $wallet_id}}'
  )
  exec_graphql 'api-key-secret' 'on-chain-address-create' "$variables"

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
}

@test "api-keys: receive key cannot mutate or read" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\"}}"
  exec_graphql 'api-key-secret' 'api-key-create' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1

  variables="{\"input\":{\"currency\":\"USD\"}}"
  exec_graphql 'api-key-secret' 'update-display-currency' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1

  exec_graphql 'api-key-secret' 'api-keys'

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1
}

@test "api-keys: receive + read can read" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\", \"RECEIVE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value "api-key-secret" "$secret"

  readOnly=$(echo "$key" | jq -r '.readOnly')
  [[ "${readOnly}" = "false" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-id" "$key_id"

  exec_graphql 'api-key-secret' 'api-keys'
  name="$(graphql_output '.data.me.apiKeys[] | select(.name == "'${key_name}'") | .name')"
  [[ "${name}" = "${key_name}" ]] || exit 1

  exec_graphql 'api-key-secret' 'authorization'
  scopes="$(graphql_output '.data.authorization.scopes')"
  [[ "$scopes" =~ "READ" ]] || exit 1
  [[ ! "$scopes" =~ "WRITE" ]] || exit 1
  [[ "$scopes" =~ "RECEIVE" ]] || exit 1
}

@test "api-keys: write + read can read" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value "api-key-secret" "$secret"

  readOnly=$(echo "$key" | jq -r '.readOnly')
  [[ "${readOnly}" = "false" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-id" "$key_id"

  exec_graphql 'api-key-secret' 'api-keys'

  name="$(graphql_output '.data.me.apiKeys[] | select(.name == "'${key_name}'") | .name')"
  [[ "${name}" = "${key_name}" ]] || exit 1

  exec_graphql 'api-key-secret' 'authorization'
  scopes="$(graphql_output '.data.authorization.scopes')"
  [[ "$scopes" =~ "READ" ]] || exit 1
  [[ "$scopes" =~ "WRITE" ]] || exit 1
  [[ ! "$scopes" =~ "RECEIVE" ]] || exit 1
}

@test "api-keys: can set and query spending limits" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  # Set daily limit
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  daily_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "100000" ]] || exit 1

  # Set weekly limit
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "WEEKLY", limitSats: 500000}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  weekly_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "500000" ]] || exit 1

  # Verify both limits are visible via query
  exec_graphql 'alice' 'api-keys'
  api_key_limits="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits')"
  daily="$(echo "$api_key_limits" | jq -r '.dailyLimitSats')"
  weekly="$(echo "$api_key_limits" | jq -r '.weeklyLimitSats')"
  daily_spent="$(echo "$api_key_limits" | jq -r '.dailySpentSats')"
  [[ "${daily}" = "100000" ]] || exit 1
  [[ "${weekly}" = "500000" ]] || exit 1
  [[ "${daily_spent}" = "0" ]] || exit 1

  cache_value "limit-test-key-id" "$key_id"
}

@test "api-keys: can remove spending limits" {
  key_id=$(read_value "limit-test-key-id")

  # Remove daily limit
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY"}}'
  )
  exec_graphql 'alice' 'api-key-remove-limit' "$variables"
  daily_limit="$(graphql_output '.data.apiKeyRemoveLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "null" ]] || exit 1

  # Weekly limit should still be set
  weekly_limit="$(graphql_output '.data.apiKeyRemoveLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "500000" ]] || exit 1

  # Remove weekly limit
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "WEEKLY"}}'
  )
  exec_graphql 'alice' 'api-key-remove-limit' "$variables"
  weekly_limit="$(graphql_output '.data.apiKeyRemoveLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "null" ]] || exit 1
}

@test "api-keys: spending limit update replaces previous value" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  # Set daily limit to 100000
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  daily_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "100000" ]] || exit 1

  # Update daily limit to 200000
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 200000}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  daily_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "200000" ]] || exit 1

  # Verify via query
  exec_graphql 'alice' 'api-keys'
  daily="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits.dailyLimitSats')"
  [[ "${daily}" = "200000" ]] || exit 1
}

@test "api-keys: set all four time window limits" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  # Set all four limits
  for window_and_amount in "DAILY:100000" "WEEKLY:500000" "MONTHLY:2000000" "ANNUAL:10000000"; do
    window="${window_and_amount%%:*}"
    amount="${window_and_amount##*:}"
    variables=$(jq -n \
      --arg id "$key_id" \
      --arg window "$window" \
      --argjson amount "$amount" \
      '{input: {id: $id, limitTimeWindow: $window, limitSats: $amount}}'
    )
    exec_graphql 'alice' 'api-key-set-limit' "$variables"
  done

  # Verify all four via query
  exec_graphql 'alice' 'api-keys'
  limits="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits')"
  daily="$(echo "$limits" | jq -r '.dailyLimitSats')"
  weekly="$(echo "$limits" | jq -r '.weeklyLimitSats')"
  monthly="$(echo "$limits" | jq -r '.monthlyLimitSats')"
  annual="$(echo "$limits" | jq -r '.annualLimitSats')"
  [[ "${daily}" = "100000" ]] || exit 1
  [[ "${weekly}" = "500000" ]] || exit 1
  [[ "${monthly}" = "2000000" ]] || exit 1
  [[ "${annual}" = "10000000" ]] || exit 1
}

@test "api-keys: no limits returns null limits with zero spending" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  exec_graphql 'alice' 'api-keys'
  limits="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits')"
  daily_limit="$(echo "$limits" | jq -r '.dailyLimitSats')"
  weekly_limit="$(echo "$limits" | jq -r '.weeklyLimitSats')"
  monthly_limit="$(echo "$limits" | jq -r '.monthlyLimitSats')"
  annual_limit="$(echo "$limits" | jq -r '.annualLimitSats')"
  daily_spent="$(echo "$limits" | jq -r '.dailySpentSats')"
  weekly_spent="$(echo "$limits" | jq -r '.weeklySpentSats')"
  monthly_spent="$(echo "$limits" | jq -r '.monthlySpentSats')"
  annual_spent="$(echo "$limits" | jq -r '.annualSpentSats')"
  [[ "${daily_limit}" = "null" ]] || exit 1
  [[ "${weekly_limit}" = "null" ]] || exit 1
  [[ "${monthly_limit}" = "null" ]] || exit 1
  [[ "${annual_limit}" = "null" ]] || exit 1
  [[ "${daily_spent}" = "0" ]] || exit 1
  [[ "${weekly_spent}" = "0" ]] || exit 1
  [[ "${monthly_spent}" = "0" ]] || exit 1
  [[ "${annual_spent}" = "0" ]] || exit 1
}

@test "api-keys: cannot set negative spending limit" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: -100}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -ge 1 ]] || exit 1
}

@test "api-keys: cannot set zero spending limit" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 0}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -ge 1 ]] || exit 1
}

@test "api-keys: remove limit that was never set is idempotent" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  # Remove daily limit that was never set — should not error
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY"}}'
  )
  exec_graphql 'alice' 'api-key-remove-limit' "$variables"

  # Verify no errors in response
  has_errors="$(graphql_output '.errors // [] | length')"
  [[ "${has_errors}" = "0" ]] || exit 1

  # Verify all limits are still null
  exec_graphql 'alice' 'api-keys'
  limits="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits')"
  daily="$(echo "$limits" | jq -r '.dailyLimitSats')"
  [[ "${daily}" = "null" ]] || exit 1
}

@test "api-keys: read-only key cannot set limits" {
  key_name="$(new_key_name)"

  # Create read-only key
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')
  cache_value "api-key-secret" "$secret"

  # Attempt to set limit using read-only API key
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}'
  )
  exec_graphql 'api-key-secret' 'api-key-set-limit' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -ge 1 ]] || exit 1
}

@test "api-keys: cannot set limit on another user's key" {
  # Create key as alice
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  alice_key_id=$(echo "$key" | jq -r '.id')

  # Create a second user (bob)
  create_user 'bob'

  # Attempt to set limit on alice's key as bob
  variables=$(jq -n \
    --arg id "$alice_key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}'
  )
  exec_graphql 'bob' 'api-key-set-limit' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -ge 1 ]] || exit 1
}

@test "api-keys: concurrent limit set operations on different windows are consistent" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  local tmpdir
  tmpdir=$(mktemp -d)

  # Fire 3 parallel set-limit calls for different time windows
  vars_daily=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}')
  vars_weekly=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "WEEKLY", limitSats: 500000}}')
  vars_monthly=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "MONTHLY", limitSats: 2000000}}')

  exec_graphql_to_file 'alice' 'api-key-set-limit' "$vars_daily" "$tmpdir/daily.json" &
  pid1=$!
  exec_graphql_to_file 'alice' 'api-key-set-limit' "$vars_weekly" "$tmpdir/weekly.json" &
  pid2=$!
  exec_graphql_to_file 'alice' 'api-key-set-limit' "$vars_monthly" "$tmpdir/monthly.json" &
  pid3=$!
  wait $pid1 $pid2 $pid3

  # Verify no errors in any response
  for f in "$tmpdir/daily.json" "$tmpdir/weekly.json" "$tmpdir/monthly.json"; do
    errors=$(jq -r '.errors // [] | length' "$f")
    [[ "${errors}" = "0" ]] || exit 1
  done

  # Query and verify all three limits are set
  exec_graphql 'alice' 'api-keys'
  limits="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits')"
  daily="$(echo "$limits" | jq -r '.dailyLimitSats')"
  weekly="$(echo "$limits" | jq -r '.weeklyLimitSats')"
  monthly="$(echo "$limits" | jq -r '.monthlyLimitSats')"
  [[ "${daily}" = "100000" ]] || exit 1
  [[ "${weekly}" = "500000" ]] || exit 1
  [[ "${monthly}" = "2000000" ]] || exit 1

  rm -rf "$tmpdir"
}

@test "api-keys: concurrent set and remove on same window" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  # Set initial daily limit
  variables=$(jq -n \
    --arg id "$key_id" \
    '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}'
  )
  exec_graphql 'alice' 'api-key-set-limit' "$variables"

  local tmpdir
  tmpdir=$(mktemp -d)

  # Fire set and remove in parallel
  vars_set=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 200000}}')
  vars_remove=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "DAILY"}}')

  exec_graphql_to_file 'alice' 'api-key-set-limit' "$vars_set" "$tmpdir/set.json" &
  pid1=$!
  exec_graphql_to_file 'alice' 'api-key-remove-limit' "$vars_remove" "$tmpdir/remove.json" &
  pid2=$!
  wait $pid1 $pid2

  # Verify no errors in either response
  for f in "$tmpdir/set.json" "$tmpdir/remove.json"; do
    errors=$(jq -r '.errors // [] | length' "$f")
    [[ "${errors}" = "0" ]] || exit 1
  done

  # Query final state — should be one of: 200000 or null (both valid outcomes)
  exec_graphql 'alice' 'api-keys'
  daily="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits.dailyLimitSats')"
  [[ "${daily}" = "200000" || "${daily}" = "null" ]] || exit 1

  rm -rf "$tmpdir"
}

@test "api-keys: concurrent identical set-limit calls are safe" {
  key_name="$(new_key_name)"
  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": [\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  key_id=$(echo "$key" | jq -r '.id')

  local tmpdir
  tmpdir=$(mktemp -d)

  # Fire 5 identical set-limit calls in parallel
  vars=$(jq -n --arg id "$key_id" '{input: {id: $id, limitTimeWindow: "DAILY", limitSats: 100000}}')

  pids=()
  for i in $(seq 1 5); do
    exec_graphql_to_file 'alice' 'api-key-set-limit' "$vars" "$tmpdir/result_${i}.json" &
    pids+=($!)
  done
  wait "${pids[@]}"

  # Verify no errors in any response
  for i in $(seq 1 5); do
    errors=$(jq -r '.errors // [] | length' "$tmpdir/result_${i}.json")
    [[ "${errors}" = "0" ]] || exit 1
  done

  # Verify final state is correct (idempotent)
  exec_graphql 'alice' 'api-keys'
  daily="$(graphql_output '.data.me.apiKeys[] | select(.id == "'${key_id}'") | .limits.dailyLimitSats')"
  [[ "${daily}" = "100000" ]] || exit 1

  rm -rf "$tmpdir"
}

@test "api-keys: cannot create key without scopes" {
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\": []}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "1" ]] || exit 1
}
