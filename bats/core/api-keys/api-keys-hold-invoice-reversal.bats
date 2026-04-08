#!/usr/bin/env bats

# Tests for API key spending reversal when hold invoices are canceled/timeout

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/user.bash"
load "../../helpers/onchain.bash"
load "../../helpers/ln.bash"

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

ALICE='alice'
BOB='bob'

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
  key_name="$(new_key_name)"
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

  # Set daily limit to 10000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"limitTimeWindow\":\"DAILY\",\"limitSats\":10000}}"
  exec_graphql 'alice' 'api-key-set-limit' "$variables"

  daily_limit="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "10000" ]] || exit 1

  spent_24h="$(graphql_output '.data.apiKeySetLimit.apiKey.limits.dailySpentSats')"
  [[ "${spent_24h}" = "0" ]] || exit 1
}

@test "hold-invoice-reversal: pay hold invoice and check spending recorded" {
  # Generate a random preimage and hash for the hold invoice
  secret=$(xxd -l 32 -c 256 -p /dev/urandom)
  payment_hash=$(echo -n $secret | xxd -r -p | sha256sum | cut -d ' ' -f1)

  cache_value "hold-invoice-preimage" "$secret"
  cache_value "hold-invoice-payment-hash" "$payment_hash"

  # Create a hold invoice on external LND with explicit hash
  invoice_response="$(lnd_outside_cli addholdinvoice "$payment_hash" --amt 5000 --memo 'Test hold invoice')"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"

  cache_value "hold-invoice-payment-request" "$payment_request"

  # Pay the invoice with API key
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql 'api-key-hold-invoice-secret' 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"

  # Payment should be pending (held)
  [[ "${send_status}" = "PENDING" || "${send_status}" = "SUCCESS" ]] || exit 1

  # Check that spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'hold_invoice_key_name')'") | .limits.dailySpentSats')"

  # Should have recorded 5000 sats spending
  [[ "${spent_24h}" -ge "5000" ]] || exit 1

  echo "✅ Spending recorded: ${spent_24h} sats"
}

@test "hold-invoice-reversal: verify payment is held on external LND" {
  payment_hash="$(read_value 'hold-invoice-payment-hash')"

  # Check invoice status on external LND
  invoice_info="$(lnd_outside_cli lookupinvoice "$payment_hash")"
  state="$(echo $invoice_info | jq -r '.state')"

  # Invoice should be in ACCEPTED state (held, not settled)
  [[ "${state}" = "ACCEPTED" ]] || exit 1

  echo "✅ Invoice is held (ACCEPTED state)"
  echo "Payment hash: $payment_hash"
}

@test "hold-invoice-reversal: cancel hold invoice" {
  payment_hash="$(read_value 'hold-invoice-payment-hash')"

  # Cancel the held invoice on external LND
  cancel_result="$(lnd_outside_cli cancelinvoice "$payment_hash" 2>&1 || true)"

  echo "Cancel result: $cancel_result"

  # Give trigger server time to process the cancellation
  sleep 10
}

@test "hold-invoice-reversal: verify spending was reversed after cancellation" {
  # Trigger the pending payment update to process the cancellation
  # This simulates what the trigger server does every 5 minutes

  # Wait a bit more for the system to process
  sleep 5

  # Check that spending was reversed
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'hold_invoice_key_name')'") | .limits.dailySpentSats')"

  # Spending should be back to 0 after reversal
  [[ "${spent_24h}" = "0" ]] || exit 1

  echo "✅ Spending reversed: ${spent_24h} sats"
}
