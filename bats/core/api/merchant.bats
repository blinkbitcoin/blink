#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"
load "../../helpers/admin.bash"
load "../../helpers/merchant.bash"

setup_file() {
  clear_cache

  create_user 'merchant'
  user_update_username 'merchant'

  login_admin
}

@test "merchant: suggest a merchant" {
  exec_graphql 'anon' 'business-map-markers'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.businessMapMarkers | length')

  token_name='merchant'

  latitude=40.712776
  longitude=-74.005974
  title="My Merchant"
  local username="$(read_value merchant.username)"

  variables=$(jq -n \
    --arg latitude "$latitude" \
    --arg longitude "$longitude" \
    --arg title "$title" \
    --arg username "$username" \
    '{input: {latitude: ($latitude | tonumber), longitude: ($longitude | tonumber), title: $title, username: $username}}'
  )

  exec_graphql "$token_name" 'merchant-map-suggest' "$variables"
  latitude_result="$(graphql_output '.data.merchantMapSuggest.merchant.coordinates.latitude')"
  [[ "$latitude_result" == "$latitude" ]] || exit 1

  # no additional merchant visible yet
  exec_graphql 'anon' 'business-map-markers'
  map_markers="$(graphql_output)"
  markers_length=$(echo "$map_markers" | jq '.data.businessMapMarkers | length')

  [[ $markers_length -eq $initial_merchants_length ]] || exit 1
}

@test "merchant: listing and approving merchant waiting for approval" {
  admin_token="$(read_value 'admin.token')"
  local username="$(read_value merchant.username)"

  exec_admin_graphql $admin_token 'merchants-pending-approval'
  id="$(graphql_output '.data.merchantsPendingApproval[0].id')"
  [[ "$id" != "null" && "$id" != "" ]] || exit 1
  cache_value 'merchant.id' "$id"

  # validating merchant
  variables=$(jq -n \
    --arg id "$id" \
    '{input: {id: $id}}'
  )
  exec_admin_graphql $admin_token 'merchant-map-validate' "$variables"
  validate_status="$(graphql_output '.data.merchantMapValidate.merchant.validated')"
  [[ "$validate_status" == "true" ]] || exit 1

  # merchant is now visible from public api
  local username="$(read_value merchant.username)"
  exec_graphql 'anon' 'business-map-markers'

  markers=$(graphql_output '.data.businessMapMarkers')
  markers_length=$(echo $markers | jq 'length')
  [[ $markers_length -gt 0 ]] || exit 1
}

@test "merchant: delete merchant with admin api" {
  exec_graphql 'anon' 'business-map-markers'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.businessMapMarkers | length')

  admin_token="$(read_value 'admin.token')"

  id="$(read_value merchant.id)"
  variables=$(jq -n \
    --arg id "$id" \
    '{input: {id: $id}}'
  )

  exec_admin_graphql $admin_token 'merchant-map-delete' "$variables"

  exec_graphql 'anon' 'business-map-markers'
  map_markers="$(graphql_output)"
  markers_length=$(echo "$map_markers" | jq '.data.businessMapMarkers | length')

  [[ $markers_length -eq $((initial_merchants_length - 1)) ]] || exit 1
}

@test "merchant: delete inactive merchant with admin api" {
  admin_token="$(read_value 'admin.token')"
  exec_admin_graphql $admin_token 'inactive-merchants'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.inactiveMerchants | length')

  create_old_merchant "old_merchant_list_delete"

  exec_admin_graphql $admin_token 'inactive-merchants'
  merchants="$(graphql_output)"
  merchants_length=$(echo "$merchants" | jq '.data.inactiveMerchants | length')
  [[ $merchants_length -eq $((initial_merchants_length + 1)) ]] || exit 1

  id=$(echo "$merchants" | jq -r ".data.inactiveMerchants[$initial_merchants_length].id")
  variables=$(jq -n \
    --arg id "$id" \
    '{input: {id: $id}}'
  )
  exec_admin_graphql $admin_token 'merchant-map-delete' "$variables"

  exec_admin_graphql $admin_token 'inactive-merchants'
  merchants="$(graphql_output)"
  merchants_length=$(echo "$merchants" | jq '.data.inactiveMerchants | length')
  [[ $merchants_length -eq $initial_merchants_length ]] || exit 1
}
