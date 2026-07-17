load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"

setup_file() {
  clear_cache

  create_user 'alice'

  local key_name="migration-$RANDOM"
  local variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  local secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value 'api-key-secret' "$secret"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value 'alice.btc_wallet_id')" \
    '{input: {walletId: $wallet_id}}'
  )
  exec_graphql 'alice' 'ln-no-amount-invoice-create' "$variables"
  local spark_invoice="$(graphql_output '.data.lnNoAmountInvoiceCreate.invoice.paymentRequest')"
  cache_value 'spark_invoice' "$spark_invoice"
}

teardown() {
  balance="$(balance_for_check)"
  if [[ "$balance" != 0 ]]; then
    fail "Error: balance_for_check failed ($balance)"
  fi
}

api_key_refusal_message="Migration is not available via API key. Please use a session."

random_nl_phone() {
  # +31 6 1XXXXXXX (NL mobile) — NL is the default windDown.affectedCountries
  printf "+3161%07d\n" $(( (RANDOM * 32768 + RANDOM) % 10000000 ))
}

commit_variables_for() {
  local token_name=$1
  local spark_invoice=$2

  node "${REPO_ROOT}/bats/helpers/migration/sign-proof.js" "$(read_value "$token_name.account_id")" \
    | jq --arg spark_invoice "$spark_invoice" \
      '{input: (. + {sparkInvoice: $spark_invoice, disclosureVersion: "e2e", backupAttested: true})}'
}

btc_balance_for() {
  local token_name=$1

  exec_graphql "$token_name" 'wallets-for-account' > /dev/null
  graphql_output '
    .data.me.defaultAccount.wallets[]
    | select(.walletCurrency == "BTC")
    .balance'
}

commit_input() {
  jq -n \
    --arg spark_invoice "$(read_value 'spark_invoice')" \
    '{input: {
      sparkPubkey: "02deadbeef",
      proofSignature: "sig",
      proofTimestamp: 1700000000,
      sparkInvoice: $spark_invoice,
      disclosureVersion: "v1",
      backupAttested: true
    }}'
}

ln_address_transfer_input() {
  jq -n \
    '{input: {
      sparkPubkey: "02deadbeef",
      proofSignature: "sig",
      proofTimestamp: 1700000000
    }}'
}

# Query ----------------------------------------------------------------------

@test "migration: authed account reads a not-started migration" {
  exec_graphql 'alice' 'migration'

  status="$(graphql_output '.data.migration.status')"
  [[ "$status" == "NOT_STARTED" ]] || exit 1

  transfer_payment_hash="$(graphql_output '.data.migration.transferPaymentHash')"
  [[ "$transfer_payment_hash" == "null" ]] || exit 1

  balance_sats="$(graphql_output '.data.migration.preview.balanceSats')"
  [[ "$balance_sats" == "0" ]] || exit 1

  fee_sats="$(graphql_output '.data.migration.preview.feeSats')"
  [[ "$fee_sats" == "0" ]] || exit 1

  fee_covered_by_blink="$(graphql_output '.data.migration.preview.feeCoveredByBlink')"
  [[ "$fee_covered_by_blink" == "false" ]] || exit 1

  receive_sats="$(graphql_output '.data.migration.preview.receiveSats')"
  [[ "$receive_sats" == "0" ]] || exit 1
}

@test "migration: query fails when unauthenticated" {
  exec_graphql 'anon' 'migration'

  [[ "$(graphql_output '.data.migration')" == "null" ]] || exit 1
  [[ "$(graphql_output '.errors[0].message')" == "Not authorized" ]] || exit 1
}

@test "migration: mutations reject unauthenticated callers" {
  exec_graphql 'anon' 'migration-start'

  [[ "$(graphql_output '.data.migrationStart')" == "null" ]] || exit 1
  [[ "$(graphql_output '.errors[0].message')" == "Not authorized" ]] || exit 1
}

# App-layer API-key refusal — the migration-specific contract, per mutation.
@test "migration: migrationStart is refused for an API key session" {
  exec_graphql 'api-key-secret' 'migration-start'

  error_message="$(graphql_output '.data.migrationStart.errors[0].message')"
  [[ "$error_message" == "$api_key_refusal_message" ]] || exit 1
}

@test "migration: migrationCommit is refused for an API key session" {
  exec_graphql 'api-key-secret' 'migration-commit' "$(commit_input)"

  error_message="$(graphql_output '.data.migrationCommit.errors[0].message')"
  [[ "$error_message" == "$api_key_refusal_message" ]] || exit 1
}

@test "migration: migrationLnAddressTransfer is refused for an API key session" {
  exec_graphql 'api-key-secret' 'migration-ln-address-transfer' "$(ln_address_transfer_input)"

  error_message="$(graphql_output '.data.migrationLnAddressTransfer.errors[0].message')"
  [[ "$error_message" == "$api_key_refusal_message" ]] || exit 1
}

@test "migration: lnAddressTransfer re-points a registered address to spark" {
  create_user 'charlie'

  username="migrate_$RANDOM$RANDOM"
  variables=$(
    jq -n \
    --arg username "$username" \
    '{input: {username: $username}}'
  )
  exec_graphql 'charlie' 'user-update-username' "$variables"
  [[ "$(graphql_output '.data.userUpdateUsername.errors | length')" == "0" ]] || exit 1

  proof="$(node "${REPO_ROOT}/bats/helpers/migration/sign-proof.js" "$(read_value 'charlie.account_id')")"
  variables="$(echo "$proof" | jq '{input: .}')"

  exec_graphql 'charlie' 'migration-ln-address-transfer' "$variables"
  [[ "$(graphql_output '.data.migrationLnAddressTransfer.errors | length')" == "0" ]] || exit 1

  username_status="$(graphql_output --arg id "$username" '.data.migrationLnAddressTransfer.results[] | select(.identifier == $id) | .status')"
  [[ "$username_status" == "TRANSFERRED" ]] || exit 1

  lightning_address="$(graphql_output --arg id "$username" '.data.migrationLnAddressTransfer.results[] | select(.identifier == $id) | .lightningAddress')"
  [[ "$lightning_address" == "$username@"* ]] || exit 1

  phone_status="$(graphql_output --arg id "$(read_value 'charlie.phone')" '.data.migrationLnAddressTransfer.results[] | select(.identifier == $id) | .status')"
  [[ "$phone_status" == "SKIPPED_NOT_REGISTERED" ]] || exit 1

  # idempotent re-run: same pubkey conflict resolves to already-transferred
  exec_graphql 'charlie' 'migration-ln-address-transfer' "$variables"
  username_status="$(graphql_output --arg id "$username" '.data.migrationLnAddressTransfer.results[] | select(.identifier == $id) | .status')"
  [[ "$username_status" == "ALREADY_TRANSFERRED" ]] || exit 1
}

# Full flow ------------------------------------------------------------------
# No spark rail in the e2e stack: an lnd_outside no-amount invoice stands in for
# the Spark wallet's swap invoice (the transfer is just a Lightning send).

@test "migration: start is refused outside the wind-down cohort" {
  # alice's +1 phone country is not in windDown.affectedCountries
  exec_graphql 'alice' 'wind-down'
  [[ "$(graphql_output '.data.windDown')" == "null" ]] || exit 1

  exec_graphql 'alice' 'migration-start'
  error_message="$(graphql_output '.data.migrationStart.errors[0].message')"
  [[ "$error_message" == "This account is not eligible for migration" ]] || exit 1
}

@test "migration: full flow drains the btc wallet to an external invoice" {
  token_name='migrator'
  phone="$(random_nl_phone)"
  login_user "$token_name" "$phone"
  cache_value "$token_name.phone" "$phone"

  funding_sats=200000
  fund_user_lightning "$token_name" "$token_name.btc_wallet_id" "$funding_sats"

  exec_graphql "$token_name" 'wind-down'
  [[ "$(graphql_output '.data.windDown.status')" != "null" ]] || exit 1

  exec_graphql "$token_name" 'migration-start'
  [[ "$(graphql_output '.data.migrationStart.errors | length')" == "0" ]] || exit 1
  [[ "$(graphql_output '.data.migrationStart.migration.status')" == "IN_PROGRESS" ]] || exit 1

  exec_graphql "$token_name" 'migration'
  balance_sats="$(graphql_output '.data.migration.preview.balanceSats')"
  [[ "$balance_sats" == "$funding_sats" ]] || exit 1
  receive_sats="$(graphql_output '.data.migration.preview.receiveSats')"
  fee_sats="$(graphql_output '.data.migration.preview.feeSats')"
  [[ "$(( receive_sats + fee_sats ))" -eq "$funding_sats" ]] || exit 1
  [[ "$(graphql_output '.data.migration.preview.feeCoveredByBlink')" == "false" ]] || exit 1

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash="$(echo $invoice_response | jq -r '.r_hash')"
  [[ "${payment_request}" != "null" ]] || exit 1

  variables="$(commit_variables_for "$token_name" "$payment_request")"
  exec_graphql "$token_name" 'migration-commit' "$variables"
  [[ "$(graphql_output '.data.migrationCommit.errors | length')" == "0" ]] || exit 1
  [[ "$(graphql_output '.data.migrationCommit.migration.status')" == "COMPLETED" ]] || exit 1

  invoice_state="$(lnd_outside_cli lookupinvoice "$payment_hash")"
  [[ "$(echo $invoice_state | jq -r '.state')" == "SETTLED" ]] || exit 1
  [[ "$(echo $invoice_state | jq -r '.amt_paid_sat')" == "$receive_sats" ]] || exit 1

  exec_graphql "$token_name" 'migration'
  [[ "$(graphql_output '.data.migration.status')" == "COMPLETED" ]] || exit 1
  [[ "$(graphql_output '.data.migration.transferPaymentHash')" == "$payment_hash" ]] || exit 1

  # residual should be 0
  [[ "$(btc_balance_for "$token_name")" == "0" ]] || exit 1
}

@test "migration: de-minimis balance is topped up by blink and drained in full" {
  token_name='migrator_dust'
  phone="$(random_nl_phone)"
  login_user "$token_name" "$phone"
  cache_value "$token_name.phone" "$phone"

  funding_sats=50
  fund_user_lightning "$token_name" "$token_name.btc_wallet_id" "$funding_sats"

  exec_graphql "$token_name" 'migration-start'
  [[ "$(graphql_output '.data.migrationStart.errors | length')" == "0" ]] || exit 1

  exec_graphql "$token_name" 'migration'
  [[ "$(graphql_output '.data.migration.preview.feeCoveredByBlink')" == "true" ]] || exit 1
  [[ "$(graphql_output '.data.migration.preview.receiveSats')" == "$funding_sats" ]] || exit 1

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash="$(echo $invoice_response | jq -r '.r_hash')"
  [[ "${payment_request}" != "null" ]] || exit 1

  variables="$(commit_variables_for "$token_name" "$payment_request")"
  exec_graphql "$token_name" 'migration-commit' "$variables"
  [[ "$(graphql_output '.data.migrationCommit.errors | length')" == "0" ]] || exit 1
  [[ "$(graphql_output '.data.migrationCommit.migration.status')" == "COMPLETED" ]] || exit 1

  invoice_state="$(lnd_outside_cli lookupinvoice "$payment_hash")"
  [[ "$(echo $invoice_state | jq -r '.state')" == "SETTLED" ]] || exit 1
  [[ "$(echo $invoice_state | jq -r '.amt_paid_sat')" == "$funding_sats" ]] || exit 1

  [[ "$(btc_balance_for "$token_name")" == "0" ]] || exit 1
}
