load "../../helpers/_common.bash"
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

api_key_refusal_message="Migration is not available via API key. Please use a session."

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

# Real re-point against the dev lnurl server (not flag- or cohort-gated).
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
