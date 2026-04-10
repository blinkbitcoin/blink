#!/usr/bin/env bats

# Tests for API key spending reversal when hold invoices are canceled/timeout

load "../../helpers/user.bash"
load "../../helpers/onchain.bash"
load "../../helpers/ln.bash"

ALICE='alice'

setup_file() {
  clear_cache

  # Ensure LND has sufficient balance for lightning tests
  lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance // 0')
  if [[ $lnd1_balance -lt "1000000" ]]; then
    create_user 'lnd_funding'
    fund_user_lightning 'lnd_funding' 'lnd_funding.btc_wallet_id' '5000000'
  fi

  create_user "$ALICE"
  fund_user_onchain "$ALICE" 'btc_wallet'
}

@test "hold-invoice-reversal: create api key with daily limit" {
  key_name="$(random_uuid)"
  cache_value 'hold_invoice_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"

  cache_value "api-key-hold-invoice-secret" "$secret"

  name=$(echo "$key" | jq -r '.name')
  [[ "${name}" = "${key_name}" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "hold-invoice-api-key-id" "$key_id"

  variables="{\"input\":{\"id\":\"${key_id}\",\"limitTimeWindow\":\"DAILY\",\"limitSats\":10000}}"
  exec_graphql 'alice' 'api-key-set-limit' "$variables"

  daily_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "10000" ]] || exit 1

  spent_24h="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailySpentSats')"
  [[ "${spent_24h}" = "0" ]] || exit 1
}

@test "hold-invoice-reversal: pay hold invoice and check spending recorded" {
  secret=$(xxd -l 32 -c 256 -p /dev/urandom)
  payment_hash=$(echo -n $secret | xxd -r -p | sha256sum | cut -d ' ' -f1)

  cache_value "hold-invoice-preimage" "$secret"
  cache_value "hold-invoice-payment-hash" "$payment_hash"

  invoice_response="$(lnd_outside_cli addholdinvoice "$payment_hash" --amt 5000 --memo 'Test hold invoice')"
  payment_request="$(echo "$invoice_response" | jq -r '.payment_request')"

  cache_value "hold-invoice-payment-request" "$payment_request"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql 'api-key-hold-invoice-secret' 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "PENDING" || "${send_status}" = "SUCCESS" ]] || exit 1

  invoice_info="$(lnd_outside_cli lookupinvoice "$payment_hash")"
  state="$(echo "$invoice_info" | jq -r '.state')"
  [[ "${state}" = "ACCEPTED" ]] || exit 1

  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'hold_invoice_key_name')'") | .limits.dailySpentSats')"
  [[ "${spent_24h}" -ge "5000" ]] || exit 1
}

@test "hold-invoice-reversal: verify spending was reversed after cancellation" {
  payment_hash="$(read_value 'hold-invoice-payment-hash')"

  lnd_outside_cli cancelinvoice "$payment_hash"

  check_spending_reversed() {
    exec_graphql 'alice' 'api-keys'
    spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'hold_invoice_key_name')'") | .limits.dailySpentSats')"
    [[ "${spent_24h}" = "0" ]] || exit 1
  }

  # Poll until the trigger server processes the cancellation and reverses spending
  retry 30 1 check_spending_reversed
}
