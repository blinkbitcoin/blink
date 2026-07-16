load "../../helpers/_common.bash"
load "../../helpers/user.bash"

# End-to-end coverage for the migration surface.
#
# Query (Query.migration) is driven for real: an authed account reads its
# not-started state and the preview resolves.
#
# The mutations (migrationStart / migrationCommit / migrationLnAddressTransfer)
# cannot be driven end-to-end here — custodialMigrationFlow.enabled is off in dev,
# and cohort membership + real proof-of-possession + a live Spark endpoint are
# absent — and their guard logic is already covered in test/unit/app/migration-flow.
# So e2e carries only what unit tests can't: one representative shield smoke (auth
# is a uniform atAccountLevel guarantee) plus the app-layer API-key refusal per
# mutation — the migration-specific contract that also proves the resolver threads
# apiKeyId through.

setup_file() {
  clear_cache

  create_user 'alice'

  # Write-scoped API key: passes scope + shield so a mutation reaches the app-layer
  # guard, where the API-key refusal is what we assert.
  local key_name="migration-$RANDOM"
  local variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  local secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  cache_value 'api-key-secret' "$secret"

  # A valid bolt11 so MigrationCommitInput.sparkInvoice passes scalar coercion and
  # the commit reaches the guard (the invoice is never paid).
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

  # preview resolves for a not-started account: the fallback carries accountId
  # into getMigrationPreview, so a fresh (unfunded) account previews a zero drain
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

# Mutations ------------------------------------------------------------------

# Shield smoke: authed-only is a uniform atAccountLevel guarantee — assert it once.
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
