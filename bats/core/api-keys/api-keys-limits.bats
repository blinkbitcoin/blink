#!/usr/bin/env bats

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
  fund_user_onchain "$ALICE" 'usd_wallet'

  create_user "$BOB"
  user_update_username "$BOB"
  ensure_username_is_present "xyz_zap_receiver"
}

@test "api-keys-limits: create key and set daily limit" {
  key_name="$(new_key_name)"
  cache_value 'limit_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"

  exec_graphql 'alice' 'api-key-create' "$variables"
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"

  cache_value "api-key-limit-secret" "$secret"

  name=$(echo "$key" | jq -r '.name')
  [[ "${name}" = "${key_name}" ]] || exit 1

  key_id=$(echo "$key" | jq -r '.id')
  cache_value "limit-api-key-id" "$key_id"

  # Set daily limit to 10000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":10000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  daily_limit="$(graphql_output '.data.apiKeySetDailyLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "10000" ]] || exit 1

  spent_24h="$(graphql_output '.data.apiKeySetDailyLimit.apiKey.limits.spentLast24HSats')"
  [[ "${spent_24h}" = "0" ]] || exit 1
}

@test "api-keys-limits: can send payment within limit" {
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=5000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "$amount" ]] || exit 1
}

@test "api-keys-limits: cannot exceed daily limit" {
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=6000  # Would exceed 10000 daily limit

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"

  # Should fail due to limit
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  errors="$(graphql_output '.data.intraLedgerPaymentSend.errors | length')"
  [[ "${errors}" -ge "1" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.intraLedgerPaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"daily"* ]] || exit 1
}

@test "api-keys-limits: set weekly limit" {
  key_id=$(read_value "limit-api-key-id")

  # Set weekly limit to 50000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"weeklyLimitSats\":50000}}"
  exec_graphql 'alice' 'api-key-set-weekly-limit' "$variables"

  weekly_limit="$(graphql_output '.data.apiKeySetWeeklyLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "50000" ]] || exit 1
}

@test "api-keys-limits: remove daily limit" {
  key_id=$(read_value "limit-api-key-id")

  variables="{\"input\":{\"id\":\"${key_id}\"}}"
  exec_graphql 'alice' 'api-key-remove-daily-limit' "$variables"

  daily_limit="$(graphql_output '.data.apiKeyRemoveDailyLimit.apiKey.limits.dailyLimitSats')"
  [[ "${daily_limit}" = "null" ]] || exit 1
}

@test "api-keys-limits: can send after removing daily limit (but weekly still applies)" {
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=3000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check total spending across all time periods
  exec_graphql 'alice' 'api-keys'
  spent_7d="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'") | .limits.spentLast7DSats')"

  # Should have accumulated spending from previous tests
  [[ "${spent_7d}" -ge "8000" ]] || exit 1
}

@test "api-keys-limits: set monthly and annual limits" {
  key_id=$(read_value "limit-api-key-id")

  # Set monthly limit to 100000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"monthlyLimitSats\":100000}}"
  exec_graphql 'alice' 'api-key-set-monthly-limit' "$variables"
  monthly_limit="$(graphql_output '.data.apiKeySetMonthlyLimit.apiKey.limits.monthlyLimitSats')"
  [[ "${monthly_limit}" = "100000" ]] || exit 1

  spent_30d="$(graphql_output '.data.apiKeySetMonthlyLimit.apiKey.limits.spentLast30DSats')"
  [[ "${spent_30d}" -ge "8000" ]] || exit 1

  # Set annual limit to 500000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"annualLimitSats\":500000}}"
  exec_graphql 'alice' 'api-key-set-annual-limit' "$variables"
  annual_limit="$(graphql_output '.data.apiKeySetAnnualLimit.apiKey.limits.annualLimitSats')"
  [[ "${annual_limit}" = "500000" ]] || exit 1

  spent_365d="$(graphql_output '.data.apiKeySetAnnualLimit.apiKey.limits.spentLast365DSats')"
  [[ "${spent_365d}" -ge "8000" ]] || exit 1
}

@test "api-keys-limits: multiple limits active - respects most restrictive" {
  # At this point we have:
  # - No daily limit (removed)
  # - Weekly: 50000 sats (spent: ~8000)
  # - Monthly: 100000 sats (spent: ~8000)
  # - Annual: 500000 sats (spent: ~8000)

  # Try to send 45000 sats - this would exceed weekly limit
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=45000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"

  # Should fail due to weekly limit
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.intraLedgerPaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"weekly"* ]] || exit 1
}

@test "api-keys-limits: can send within all active limits" {
  # Send 30000 sats - within weekly (50000 - 8000 = 42000 remaining)
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=30000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending updated across all time windows
  exec_graphql 'alice' 'api-keys'
  key_data="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'")')"

  spent_24h=$(echo "$key_data" | jq -r '.limits.spentLast24HSats')
  spent_7d=$(echo "$key_data" | jq -r '.limits.spentLast7DSats')
  spent_30d=$(echo "$key_data" | jq -r '.limits.spentLast30DSats')
  spent_365d=$(echo "$key_data" | jq -r '.limits.spentLast365DSats')

  [[ "${spent_24h}" -ge "30000" ]] || exit 1
  [[ "${spent_7d}" -ge "38000" ]] || exit 1
  [[ "${spent_30d}" -ge "38000" ]] || exit 1
  [[ "${spent_365d}" -ge "38000" ]] || exit 1
}

@test "api-keys-limits: spending tracked consistently across time windows" {
  exec_graphql 'alice' 'api-keys'
  key_data="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'")')"

  # Verify all limits are still set
  daily_limit=$(echo "$key_data" | jq -r '.limits.dailyLimitSats')
  weekly_limit=$(echo "$key_data" | jq -r '.limits.weeklyLimitSats')
  monthly_limit=$(echo "$key_data" | jq -r '.limits.monthlyLimitSats')
  annual_limit=$(echo "$key_data" | jq -r '.limits.annualLimitSats')

  [[ "${daily_limit}" = "null" ]] || exit 1
  [[ "${weekly_limit}" = "50000" ]] || exit 1
  [[ "${monthly_limit}" = "100000" ]] || exit 1
  [[ "${annual_limit}" = "500000" ]] || exit 1

  # Verify spending is consistent across all time windows (since all payments are within last 24h)
  spent_24h=$(echo "$key_data" | jq -r '.limits.spentLast24HSats')
  spent_7d=$(echo "$key_data" | jq -r '.limits.spentLast7DSats')
  spent_30d=$(echo "$key_data" | jq -r '.limits.spentLast30DSats')
  spent_365d=$(echo "$key_data" | jq -r '.limits.spentLast365DSats')

  [[ "${spent_24h}" = "${spent_7d}" ]] || exit 1
  [[ "${spent_7d}" = "${spent_30d}" ]] || exit 1
  [[ "${spent_30d}" = "${spent_365d}" ]] || exit 1
}

@test "api-keys-limits: update existing limit to lower value" {
  key_id=$(read_value "limit-api-key-id")

  # Update weekly limit to 40000 (already spent ~38000)
  variables="{\"input\":{\"id\":\"${key_id}\",\"weeklyLimitSats\":40000}}"
  exec_graphql 'alice' 'api-key-set-weekly-limit' "$variables"
  weekly_limit="$(graphql_output '.data.apiKeySetWeeklyLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "40000" ]] || exit 1

  # Try to send 3000 - should fail as it would exceed updated limit
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=3000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.intraLedgerPaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"weekly"* ]] || exit 1
}

@test "api-keys-limits: remove all limits" {
  key_id=$(read_value "limit-api-key-id")

  # Remove weekly limit
  variables="{\"input\":{\"id\":\"${key_id}\"}}"
  exec_graphql 'alice' 'api-key-remove-weekly-limit' "$variables"
  weekly_limit="$(graphql_output '.data.apiKeyRemoveWeeklyLimit.apiKey.limits.weeklyLimitSats')"
  [[ "${weekly_limit}" = "null" ]] || exit 1

  # Remove monthly limit
  exec_graphql 'alice' 'api-key-remove-monthly-limit' "$variables"
  monthly_limit="$(graphql_output '.data.apiKeyRemoveMonthlyLimit.apiKey.limits.monthlyLimitSats')"
  [[ "${monthly_limit}" = "null" ]] || exit 1

  # Remove annual limit
  exec_graphql 'alice' 'api-key-remove-annual-limit' "$variables"
  annual_limit="$(graphql_output '.data.apiKeyRemoveAnnualLimit.apiKey.limits.annualLimitSats')"
  [[ "${annual_limit}" = "null" ]] || exit 1
}

@test "api-keys-limits: can send large amount with no limits" {
  # With all limits removed, should be able to send larger amounts
  local from_wallet_name="$ALICE.btc_wallet_id"
  local to_wallet_name="$BOB.btc_wallet_id"
  local amount=100000

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $from_wallet_name)" \
    --arg recipient_wallet_id "$(read_value $to_wallet_name)" \
    --arg amount "$amount" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-limit-secret' 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Spending should still be tracked even without limits
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "130000" ]] || exit 1
}

# ============================================================================
# Tests for different payment flows (lightning, on-chain, lnurl, no-amount invoices)
# ============================================================================

@test "api-keys-limits: lightning payment respects limits" {
  # Create new API key with daily limit for lightning tests
  key_name="$(new_key_name)"
  cache_value 'ln_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-ln-secret" "$secret"
  cache_value "ln-api-key-id" "$key_id"

  # Set daily limit to 5000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":5000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Create invoice for 3000 sats
  invoice_response="$(lnd_outside_cli addinvoice --amt 3000)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  # Send lightning payment with API key
  exec_graphql 'api-key-ln-secret' 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'ln_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "3000" ]] || exit 1
}

@test "api-keys-limits: lightning payment exceeding limit fails" {
  # Try to send 3000 more sats (would exceed 5000 limit)
  invoice_response="$(lnd_outside_cli addinvoice --amt 3000)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql 'api-key-ln-secret' 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.lnInvoicePaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"daily"* ]] || exit 1
}

@test "api-keys-limits: onchain payment respects limits" {
  # Create new API key with daily limit for onchain tests
  key_name="$(new_key_name)"
  cache_value 'onchain_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-onchain-secret" "$secret"
  cache_value "onchain-api-key-id" "$key_id"

  # Set daily limit to 10000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":10000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Create onchain address
  onchain_address=$(bitcoin_cli getnewaddress)

  # Send onchain payment for 5000 sats with API key
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg address "$onchain_address" \
    --argjson amount "5000" \
    '{input: {walletId: $wallet_id, address: $address, amount: $amount}}'
  )

  exec_graphql 'api-key-onchain-secret' 'on-chain-payment-send' "$variables"
  send_status="$(graphql_output '.data.onChainPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'onchain_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "5000" ]] || exit 1
}

@test "api-keys-limits: onchain payment exceeding limit fails" {
  # Try to send 6000 more sats (would exceed 10000 limit)
  onchain_address=$(bitcoin_cli getnewaddress)

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg address "$onchain_address" \
    --argjson amount "6000" \
    '{input: {walletId: $wallet_id, address: $address, amount: $amount}}'
  )

  exec_graphql 'api-key-onchain-secret' 'on-chain-payment-send' "$variables"
  send_status="$(graphql_output '.data.onChainPaymentSend.status')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.onChainPaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"daily"* ]] || exit 1
}

@test "api-keys-limits: mixed payment flows tracked separately per key" {
  # Verify that each API key tracks its own spending independently
  
  # Check intraledger key spending (original key from earlier tests)
  exec_graphql 'alice' 'api-keys'
  intraledger_spent="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'limit_key_name')'") | .limits.spentLast24HSats')"
  [[ "${intraledger_spent}" -ge "130000" ]] || exit 1

  # Check lightning key spending (separate key)
  ln_spent="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'ln_key_name')'") | .limits.spentLast24HSats')"
  [[ "${ln_spent}" -ge "3000" ]] || exit 1
  [[ "${ln_spent}" -lt "10000" ]] || exit 1

  # Check onchain key spending (separate key)
  onchain_spent="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'onchain_key_name')'") | .limits.spentLast24HSats')"
  [[ "${onchain_spent}" -ge "5000" ]] || exit 1
  [[ "${onchain_spent}" -lt "10000" ]] || exit 1

  # Each key should have independent spending totals
  [[ "${intraledger_spent}" != "${ln_spent}" ]] || exit 1
  [[ "${intraledger_spent}" != "${onchain_spent}" ]] || exit 1
}

@test "api-keys-limits: USD wallet payments also respect limits" {
  # Create API key with daily limit for USD wallet tests
  key_name="$(new_key_name)"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"
  
  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-usd-secret" "$secret"

  # Set daily limit to 50000 sats (in satoshi equivalent)
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":50000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Send USD intraledger payment (amount in cents)
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.usd_wallet_id)" \
    --arg recipient_wallet_id "$(read_value $BOB.usd_wallet_id)" \
    --argjson amount "25" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )

  exec_graphql 'api-key-usd-secret' 'intraledger-usd-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerUsdPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded (converted to sats)
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$key_name'") | .limits.spentLast24HSats')"
  # USD amount converted to sats should be tracked
  [[ "${spent_24h}" -gt "0" ]] || exit 1
}

@test "api-keys-limits: lnNoAmountInvoicePaymentSend respects limits" {
  # Create new API key with daily limit
  key_name="$(new_key_name)"
  cache_value 'ln_noamount_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"

  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-ln-noamount-secret" "$secret"
  cache_value "ln-noamount-api-key-id" "$key_id"

  # Set daily limit to 8000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":8000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Create no-amount invoice
  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"

  # Pay 4000 sats to the no-amount invoice
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    --argjson amount "4000" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql 'api-key-ln-noamount-secret' 'ln-no-amount-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'ln_noamount_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "4000" ]] || exit 1
}

@test "api-keys-limits: lnNoAmountInvoicePaymentSend exceeding limit fails" {
  # Try to pay 5000 more sats (would exceed 8000 limit)
  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --arg payment_request "$payment_request" \
    --argjson amount "5000" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql 'api-key-ln-noamount-secret' 'ln-no-amount-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.status')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"daily"* ]] || exit 1
}

@test "api-keys-limits: lnNoAmountUsdInvoicePaymentSend respects limits" {
  # Create new API key with daily limit
  key_name="$(new_key_name)"
  cache_value 'ln_noamount_usd_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"

  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-ln-noamount-usd-secret" "$secret"

  # Set daily limit to 8000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":8000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Create no-amount invoice
  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"

  # Pay 30 cents (USD) to the no-amount invoice from USD wallet
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.usd_wallet_id)" \
    --arg payment_request "$payment_request" \
    --argjson amount "30" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql 'api-key-ln-noamount-usd-secret' 'ln-no-amount-usd-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded (converted to sats)
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'ln_noamount_usd_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -gt "0" ]] || exit 1
}

@test "api-keys-limits: lnurlPaymentSend respects limits" {
  # Create new API key with daily limit
  key_name="$(new_key_name)"
  cache_value 'lnurl_key_name' "$key_name"

  variables="{\"input\":{\"name\":\"${key_name}\",\"scopes\":[\"READ\",\"WRITE\"]}}"
  exec_graphql 'alice' 'api-key-create' "$variables"

  key="$(graphql_output '.data.apiKeyCreate.apiKey')"
  secret="$(graphql_output '.data.apiKeyCreate.apiKeySecret')"
  key_id=$(echo "$key" | jq -r '.id')

  cache_value "api-key-lnurl-secret" "$secret"

  # Set daily limit to 5000 sats
  variables="{\"input\":{\"id\":\"${key_id}\",\"dailyLimitSats\":5000}}"
  exec_graphql 'alice' 'api-key-set-daily-limit' "$variables"

  # Send payment via lnurl (to xyz_zap_receiver)
  lnurl="lnurl1dp68gup69uhkcmmrv9kxsmmnwsarxvpsxghjuam9d3kz66mwdamkutmvde6hymrs9au8j7jl0fshqhmjv43k26tkv4eq5ndl2y"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --argjson amount "2000" \
    --arg lnurl "$lnurl" \
    '{input: {walletId: $wallet_id, amount: $amount, lnurl: $lnurl}}'
  )

  exec_graphql 'api-key-lnurl-secret' 'lnurl-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnurlPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Verify spending was recorded
  exec_graphql 'alice' 'api-keys'
  spent_24h="$(graphql_output '.data.me.apiKeys[] | select(.name == "'$(read_value 'lnurl_key_name')'") | .limits.spentLast24HSats')"
  [[ "${spent_24h}" -ge "2000" ]] || exit 1
}

@test "api-keys-limits: lnurlPaymentSend exceeding limit fails" {
  # Try to send 4000 more sats (would exceed 5000 limit)
  lnurl="lnurl1dp68gup69uhkcmmrv9kxsmmnwsarxvpsxghjuam9d3kz66mwdamkutmvde6hymrs9au8j7jl0fshqhmjv43k26tkv4eq5ndl2y"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $ALICE.btc_wallet_id)" \
    --argjson amount "4000" \
    --arg lnurl "$lnurl" \
    '{input: {walletId: $wallet_id, amount: $amount, lnurl: $lnurl}}'
  )

  exec_graphql 'api-key-lnurl-secret' 'lnurl-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnurlPaymentSend.status')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1

  # Verify error message contains limit information
  error_msg="$(graphql_output '.data.lnurlPaymentSend.errors[0].message')"
  [[ "${error_msg}" == *"daily"* ]] || exit 1
}