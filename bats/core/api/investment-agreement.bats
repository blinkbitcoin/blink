#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"

# DocuSign runs with ESIGN_PROVIDER=mock in this environment

agreement_path='.data.investmentAgreementCreate.investmentAgreement'

setup_file() {
  clear_cache

  local key_owner='investment_agreement_key_owner'
  create_user "$key_owner"

  local variables="{\"input\":{\"name\":\"investment-agreement-$RANDOM\",\"scopes\":[\"WRITE\"]}}"
  exec_graphql "$key_owner" 'api-key-create' "$variables"
  cache_value 'api-key-investment-agreement' "$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
}

create_investor() {
  local token_name=$1
  create_user "$token_name"

  local email="$(cat /proc/sys/kernel/random/uuid)@blink.sv"
  local variables=$(jq -n --arg email "$email" '{input: {email: $email}}')
  exec_graphql "$token_name" 'user-email-registration-initiate' "$variables"
  [[ "$(graphql_output '.data.userEmailRegistrationInitiate.errors | length')" == "0" ]] || exit 1
}

create_agreement() {
  local token_name=$1
  local units=$2

  local variables=$(jq -n --argjson units "$units" '{input: {units: $units}}')
  exec_graphql "$token_name" 'investment-agreement-create' "$variables"
}

@test "investment-agreement: query returns null before any agreement" {
  create_investor 'investor_without_agreement'

  exec_graphql 'investor_without_agreement' 'investment-agreement'
  [[ "$(graphql_output '.errors')" == "null" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement')" == "null" ]] || exit 1
}

@test "investment-agreement: create starts signing with the contract terms" {
  create_investor 'investor_create'

  create_agreement 'investor_create' 1000
  [[ "$(graphql_output '.data.investmentAgreementCreate.errors | length')" == "0" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreementCreate.signingUrl')" != "null" ]] || exit 1

  [[ "$(graphql_output "$agreement_path.signingStatus")" == "SIGNING_STARTED" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.paymentStatus")" == "UNPAID" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.units")" == "1000" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.pricePerUnitUsdCents")" == "100" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.totalUsdCents")" == "100000" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.preMoneyValuationUsdCents")" == "1000000000" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.quotedAt")" != "null" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.paymentDeadline")" == "null" ]] || exit 1

  local rate_cents="$(graphql_output "$agreement_path.btcUsdRateCents")"
  local settlement_sats="$(graphql_output "$agreement_path.settlementSats")"
  local expected_sats=$(( (100000 * 100000000 + rate_cents - 1) / rate_cents ))
  [[ "$rate_cents" -gt 0 ]] || exit 1
  [[ "$settlement_sats" == "$expected_sats" ]] || exit 1
}

@test "investment-agreement: query returns the latest agreement" {
  create_investor 'investor_query'

  create_agreement 'investor_query' 500
  local agreement_id="$(graphql_output "$agreement_path.id")"

  exec_graphql 'investor_query' 'investment-agreement'
  [[ "$(graphql_output '.data.investmentAgreement.id')" == "$agreement_id" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement.units')" == "500" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement.signingStatus')" == "SIGNING_STARTED" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement.paymentStatus')" == "UNPAID" ]] || exit 1
}

@test "investment-agreement: create reopens the signing for the same units" {
  create_investor 'investor_reopen'

  create_agreement 'investor_reopen' 1000
  local agreement_id="$(graphql_output "$agreement_path.id")"

  create_agreement 'investor_reopen' 1000
  [[ "$(graphql_output '.data.investmentAgreementCreate.errors | length')" == "0" ]] || exit 1
  [[ "$(graphql_output "$agreement_path.id")" == "$agreement_id" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreementCreate.signingUrl')" != "null" ]] || exit 1
}

@test "investment-agreement: create keeps the agreement in progress for different units" {
  create_investor 'investor_units_change'

  create_agreement 'investor_units_change' 1000
  local agreement_id="$(graphql_output "$agreement_path.id")"

  create_agreement 'investor_units_change' 2000
  error_message="$(graphql_output '.data.investmentAgreementCreate.errors[0].message')"
  [[ "$error_message" == "An investment agreement is already in progress for this account." ]] || exit 1

  exec_graphql 'investor_units_change' 'investment-agreement'
  [[ "$(graphql_output '.data.investmentAgreement.id')" == "$agreement_id" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement.units')" == "1000" ]] || exit 1
  [[ "$(graphql_output '.data.investmentAgreement.signingStatus')" == "SIGNING_STARTED" ]] || exit 1
}

@test "investment-agreement: create fails for units out of range" {
  create_investor 'investor_invalid_units'

  for units in 0 100001; do
    create_agreement 'investor_invalid_units' "$units"
    error_message="$(graphql_output '.data.investmentAgreementCreate.errors[0].message')"
    [[ "$error_message" == "Invalid number of units: $units" ]] || exit 1
  done
}

@test "investment-agreement: create fails without an email" {
  create_user 'investor_without_email'

  create_agreement 'investor_without_email' 1000
  error_message="$(graphql_output '.data.investmentAgreementCreate.errors[0].message')"
  [[ "$error_message" == "An email address is required to sign the investment agreement." ]] || exit 1
}

@test "investment-agreement: create is refused for an api key" {
  create_agreement 'api-key-investment-agreement' 1000

  error_message="$(graphql_output '.data.investmentAgreementCreate.errors[0].message')"
  [[ "$error_message" == "Investment agreements are not available via API key. Please use a session." ]] || exit 1
}

@test "investment-agreement: create and query reject unauthenticated callers" {
  create_agreement 'anon' 1000
  [[ "$(graphql_output '.data.investmentAgreementCreate')" == "null" ]] || exit 1
  [[ "$(graphql_output '.errors[0].message')" == "Not authorized" ]] || exit 1

  exec_graphql 'anon' 'investment-agreement'
  [[ "$(graphql_output '.data.investmentAgreement')" == "null" ]] || exit 1
  [[ "$(graphql_output '.errors[0].message')" == "Not authorized" ]] || exit 1
}

@test "investment-agreement: signing return bridge posts the signing event" {
  local headers_file="$(mktemp)"
  local body="$(curl -s -D "$headers_file" "${OATHKEEPER_PROXY}/signing/return?event=signing_complete")"

  head -n 1 "$headers_file" | grep -q " 200" || exit 1
  grep -qi "^content-security-policy: default-src 'none'; script-src 'nonce-" "$headers_file" || exit 1
  grep -qi "^cache-control: no-store" "$headers_file" || exit 1
  [[ "$body" == *'"signing_complete"'* ]] || exit 1
}

@test "investment-agreement: signing return bridge reports an unknown event as an exception" {
  local body="$(curl -s "${OATHKEEPER_PROXY}/signing/return?event=not_a_docusign_event")"

  [[ "$body" == *'"exception"'* ]] || exit 1
  [[ "$body" != *'not_a_docusign_event'* ]] || exit 1
}
