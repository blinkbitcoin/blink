#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"

random_is_phone() {
  # +354 6XXXXXX — IS is a decoy seeded only in the dev regionRestrictions config
  printf "+3546%06d\n" $(( (RANDOM * 32768 + RANDOM) % 1000000 ))
}

@test "region: anon region check fails open on an unresolvable ip" {
  exec_graphql 'anon' 'region-check'

  [[ "$(graphql_output '.data.regionCheck.countryCode')" == "null" ]] || exit 1
  [[ "$(graphql_output '.data.regionCheck.restricted')" == "false" ]] || exit 1
  [[ "$(graphql_output '.data.regionCheck.custodialCreationAllowed')" == "true" ]] || exit 1
}

@test "region: blocked-country phone is restricted on dollar balance only" {
  local token_name="region_blocked"
  login_user "$token_name" "$(random_is_phone)"

  exec_graphql "$token_name" 'custodial-restrictions'

  [[ "$(graphql_output '.data.custodialRestrictions.dollarBalance')" == "true" ]] || exit 1
  [[ "$(graphql_output '.data.custodialRestrictions.transfer')" == "false" ]] || exit 1
}

@test "region: unblocked-country phone has no restrictions" {
  local token_name="region_unblocked"
  login_user "$token_name" "$(random_phone)"

  exec_graphql "$token_name" 'custodial-restrictions'

  [[ "$(graphql_output '.data.custodialRestrictions.dollarBalance')" == "false" ]] || exit 1
  [[ "$(graphql_output '.data.custodialRestrictions.transfer')" == "false" ]] || exit 1
}
