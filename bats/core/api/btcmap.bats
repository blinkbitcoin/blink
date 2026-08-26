#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"
load "../../helpers/admin.bash"

# No btcmap instance runs in this environment, so only the level gate and the
# validation paths (which never reach the upstream service) are exercised here.

setup_file() {
  clear_cache

  create_user 'btcmap'

  login_admin
}

upgrade_to_level_two() {
  local token_name=$1
  local admin_token="$(read_value 'admin.token')"
  local account_id="$(read_value "$token_name.account_id")"

  local variables=$(
    jq -n \
    --arg level "TWO" \
    --arg accountId "$account_id" \
    '{input: {level: $level, accountId: $accountId}}'
  )
  exec_admin_graphql "$admin_token" 'account-update-level' "$variables"
  local level="$(graphql_output '.data.accountUpdateLevel.accountDetails.level')"
  [[ "$level" == "TWO" ]] || exit 1
}

submit_place() {
  local latitude=$1
  local longitude=$2
  local category=$3
  local name=$4

  local variables=$(
    jq -n \
    --arg submissionId "$(cat /proc/sys/kernel/random/uuid)" \
    --arg latitude "$latitude" \
    --arg longitude "$longitude" \
    --arg category "$category" \
    --arg name "$name" \
    '{input: {submissionId: $submissionId, latitude: ($latitude | tonumber), longitude: ($longitude | tonumber), category: $category, name: $name}}'
  )
  exec_graphql 'btcmap' 'btc-map-place-submit' "$variables"
}

@test "btcmap: place submit requires account level two" {
  submit_place "4.6097" "-74.0817" "food" "Arepas Place"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "requires a higher account verification level" ]] || exit 1
}

@test "btcmap: validates place name for level two accounts" {
  upgrade_to_level_two 'btcmap'

  submit_place "4.6097" "-74.0817" "food" "ab"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "Name should be between 3 and 100 characters" ]] || exit 1

  submit_place "4.6097" "-74.0817" "food" "   "
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "Name should be between 3 and 100 characters" ]] || exit 1
}

@test "btcmap: validates place category for level two accounts" {
  submit_place "4.6097" "-74.0817" "Fast Food" "Arepas Place"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "Invalid category" ]] || exit 1
}

@test "btcmap: validates place coordinates for level two accounts" {
  submit_place "91" "-74.0817" "food" "Arepas Place"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "Latitude must be between -90 and 90" ]] || exit 1
}

@test "btcmap: validates submissionId for level two accounts" {
  local variables=$(
    jq -n \
    '{input: {submissionId: "not-a-uuid", latitude: 4.6097, longitude: -74.0817, category: "food", name: "Arepas Place"}}'
  )
  exec_graphql 'btcmap' 'btc-map-place-submit' "$variables"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "submissionId must be a valid UUID" ]] || exit 1
}

@test "btcmap: returns a fixed error and leaks no internals when not configured" {
  submit_place "4.6097" "-74.0817" "food" "Arepas Place"
  error_msg="$(graphql_output '.data.btcMapPlaceSubmit.errors[0].message')"
  [[ "$error_msg" =~ "Could not submit the place to the map" ]] || exit 1
  [[ "$error_msg" != *"BTCMAP"* ]] || exit 1
}
