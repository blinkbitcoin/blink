#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/callback.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/onchain.bash"
load "../../helpers/user.bash"
load "../../helpers/wallet.bash"

ALICE='alice'
BOB='bob'
COP_HISTORY_USER='cop_history'
XTS_HISTORY_USER='xts_history'

setup_file() {
  clear_cache

  lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  if [[ $lnd1_balance -lt "1000000" ]]; then
    create_user 'lnd_funding'
    fund_user_lightning 'lnd_funding' 'lnd_funding.btc_wallet_id' '5000000'
  fi

  create_user "$ALICE"
  add_callback "$ALICE"
  user_update_username "$ALICE"
  fund_user_onchain "$ALICE" 'btc_wallet'
  fund_user_onchain "$ALICE" 'usd_wallet'
}

teardown() {
  balance="$(balance_for_check)"
  if [[ "$balance" != 0 ]]; then
    fail "Error: balance_for_check failed ($balance)"
  fi
}

btc_amount=1000
usd_amount=50

assert_transaction_history_precision() {
  local token_name="$1"
  local currency="$2"
  local expected_amount="$3"
  local expected_fee="$4"
  local simulate_legacy_row="${5:-false}"
  local btc_wallet_name="$token_name.btc_wallet_id"

  create_user "$token_name"
  fund_user_onchain "$token_name" 'btc_wallet'
  variables="$(jq -n --arg currency "$currency" '{input: {currency: $currency}}')"
  exec_graphql "$token_name" 'update-display-currency' "$variables"
  errors="$(graphql_output '.data.accountUpdateDisplayCurrency.errors | length')"
  [[ "$errors" = "0" ]] || exit 1

  invoice_response="$(lnd_outside_cli addinvoice --amt $btc_amount)"
  payment_request="$(echo "$invoice_response" | jq -r '.payment_request')"
  payment_hash="$(echo "$invoice_response" | jq -r '.r_hash')"
  [[ "$payment_request" != "null" ]] || exit 1

  variables=$(
    jq -n \
      --arg wallet_id "$(read_value "$btc_wallet_name")" \
      --arg payment_request "$payment_request" \
      '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "$send_status" = "SUCCESS" ]] || exit 1

  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  if [[ "$simulate_legacy_row" = "true" ]]; then
    mongo_command=$(echo "db.getCollection('medici_transactions').updateMany({
      'hash': '$payment_hash',
    }, {
      \$unset: { 'displayCurrencyFractionDigits': '' },
      \$set: { 'timestamp': ISODate('2026-07-03T14:22:08Z') }
    });" | tr -d '[:space:]')
    mongo_cli "$mongo_command"
    legacy_rows_count=$(mongo_cli "db.getCollection('medici_transactions').countDocuments({
      'hash': '$payment_hash',
      'displayCurrencyFractionDigits': { \$exists: false },
      'timestamp': ISODate('2026-07-03T14:22:08Z')
    })")
    [[ "$legacy_rows_count" -gt 0 ]] || exit 1
  fi

  history_transactions="$(txns_for_hash "$token_name" "$payment_hash")"
  [[ "$(echo "$history_transactions" | jq -r 'length')" = "1" ]] || exit 1
  history_transaction="$(echo "$history_transactions" | jq -c '.[0].node')"
  [[ "$(echo "$history_transaction" | jq -r '.settlementDisplayCurrency')" = "$currency" ]] || exit 1
  [[ "$(echo "$history_transaction" | jq -r '.settlementDisplayAmount')" = "$expected_amount" ]] || exit 1
  [[ "$(echo "$history_transaction" | jq -r '.settlementDisplayFee')" = "$expected_fee" ]] || exit 1
}

@test "ln-send: COP transaction history honors two price-service fraction digits" {
  assert_transaction_history_precision "$COP_HISTORY_USER" "COP" "-2000.00" "0.00" true
}

@test "ln-send: XTS transaction history honors zero price-service fraction digits" {
  assert_transaction_history_precision "$XTS_HISTORY_USER" "XTS" "-20" "0"
}

@test "ln-send: lightning settled - lnInvoicePaymentSend from btc" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice --amt $btc_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-invoice-fee-probe' "$variables"
  fee_amount="$(graphql_output '.data.lnInvoiceFeeProbe.amount')"
  [[ "${fee_amount}" = "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for callback
  num_callback_events=$(cat_callback | grep "$payment_hash" | grep "success" | wc -l)
  [[ "${num_callback_events}" == "1" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1

    statusAfterSuccess="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterSuccess}" == "SUCCESS" ]] || exit 1
}

@test "ln-send: lightning settled - lnInvoicePaymentSend from btc, no fee probe" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice --amt $btc_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1
}

@test "ln-send: lightning settled - lnInvoicePaymentSend from usd" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice --amt $btc_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-usd-invoice-fee-probe' "$variables"
  fee_amount="$(graphql_output '.data.lnUsdInvoiceFeeProbe.amount')"
  [[ "${fee_amount}" = "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1
}

@test "ln-send: lightning settled - lnInvoicePaymentSend from usd, no fee probe" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice --amt $btc_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1
}

@test "ln-send: lightning settled - lnNoAmountInvoicePaymentSend" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $btc_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-invoice-fee-probe' "$variables"
  fee_amount="$(graphql_output '.data.lnNoAmountInvoiceFeeProbe.amount')"
  [[ "${fee_amount}" = "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-no-amount-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1
}

@test "ln-send: lightning settled - lnNoAmountInvoicePaymentSend, no fee probe" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $btc_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "$btc_amount" ]] || exit 1
}

@test "ln-send: lightning settled - lnNoAmountUsdInvoicePaymentSend" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"

  initial_balance="$(balance_for_wallet $token_name 'USD')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $usd_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-usd-invoice-fee-probe' "$variables"
  fee_amount="$(graphql_output '.data.lnNoAmountUsdInvoiceFeeProbe.amount')"
  [[ "${fee_amount}" = "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-no-amount-usd-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  final_balance="$(balance_for_wallet $token_name 'USD')"
  wallet_diff="$(( $initial_balance - $final_balance ))"
  [[ "$wallet_diff" == "$usd_amount" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" -gt "0" ]] || exit 1
}

@test "ln-send: lightning settled - lnNoAmountUsdInvoicePaymentSend, no fee probe" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"

  initial_balance="$(balance_for_wallet $token_name 'USD')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  invoice_response="$(lnd_outside_cli addinvoice)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $usd_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-usd-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  # without a probe the fee reserve is retained (skipFeeReimbursement), so the
  # wallet is debited amount + fee
  settlement_fee="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.settlementFee')"
  [[ "$settlement_fee" -gt "0" ]] || exit 1

  final_balance="$(balance_for_wallet $token_name 'USD')"
  wallet_diff="$(( $initial_balance - $final_balance ))"
  [[ "$wallet_diff" == "$(( $usd_amount + $settlement_fee ))" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" -gt "0" ]] || exit 1
}

@test "ln-send: intraledger settled - lnInvoicePaymentSend from btc to btc, with contacts check" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"
  external_id="external-id-1"

  create_user "$BOB"
  user_update_username "$BOB"
  bob_btc_wallet_name="$BOB.btc_wallet_id"

  initial_balance="$(balance_for_wallet $token_name 'BTC')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  # Check is not contact before send
  run is_contact "$token_name" "$BOB"
  [[ "$status" -ne "0" ]] || exit 1
  run is_contact "$BOB" "$token_name"
  [[ "$status" -ne "0" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_btc_wallet_name)" \
    --arg amount "$btc_amount" \
    --arg external_id "$external_id" \
    '{input: {walletId: $wallet_id, amount: $amount, externalId: $external_id}}'
  )
  exec_graphql "$BOB" 'ln-invoice-create' "$variables"
  invoice="$(graphql_output '.data.lnInvoiceCreate.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1
  payment_external_id="$(echo $invoice | jq -r '.externalId')"
  [[ "${payment_external_id}" == "${external_id}" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  transaction_payment_pre_image="$(graphql_output '.data.lnInvoicePaymentSend.transaction.settlementVia.preImage')"
  transaction_payment_hash_from_pre_image=$(echo -n $transaction_payment_pre_image | xxd -r -p | sha256sum | cut -d ' ' -f1)
  [[ "${transaction_payment_hash_from_pre_image}" == "${payment_hash}" ]] || exit 1

  transaction_external_id="$(graphql_output '.data.lnInvoicePaymentSend.transaction.externalId')"
  [[ "${transaction_external_id}" == "${external_id}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  check_for_ln_initiated_settled "$BOB" "$payment_hash"

  tx_query_external_id="$(get_from_transaction_by_ln_hash_and_status $payment_hash 'SUCCESS' '.externalId')"
  [[ "${tx_query_external_id}" == "${external_id}" ]] || exit 1

  final_balance="$(balance_for_wallet $token_name 'BTC')"
  wallet_diff="$(( $initial_balance - $final_balance ))"
  [[ "$wallet_diff" == "$btc_amount" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "0" ]] || exit 1

  # Check is contact after send
  run is_contact "$token_name" "$BOB"
  [[ "$status" == "0" ]] || exit 1
  run is_contact "$BOB" "$token_name"
  [[ "$status" == "0" ]] || exit 1
}

@test "ln-send: intraledger settled - lnurl comment shown to recipient from descriptionHash invoice" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"
  comment="Great post, here is a tip"

  create_user "$BOB"
  user_update_username "$BOB"
  bob_btc_wallet_name="$BOB.btc_wallet_id"

  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  # LNURL-pay style invoice created anonymously on behalf of the recipient: the
  # comment is stored as the LND invoice description while the bolt11 only
  # carries the description hash
  metadata='[["text/plain","Payment to bob"]]'
  description_hash=$(printf '%s' "$metadata" | sha256sum | cut -d ' ' -f1)
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_btc_wallet_name)" \
    --arg amount "$btc_amount" \
    --arg description_hash "$description_hash" \
    --arg memo "$comment" \
    '{input: {recipientWalletId: $wallet_id, amount: $amount, descriptionHash: $description_hash, memo: $memo}}'
  )
  exec_graphql 'anon' 'ln-invoice-create-on-behalf-of-recipient' "$variables"
  invoice="$(graphql_output '.data.lnInvoiceCreateOnBehalfOfRecipient.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1

  # Pay without a sender memo so the recipient memo can only come from the invoice
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  check_for_ln_initiated_settled "$BOB" "$payment_hash"

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "0" ]] || exit 1

  # Recipient sees the lnurl comment as the transaction memo
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_btc_wallet_name)" \
    --arg payment_hash "$payment_hash" \
    '{walletId: $wallet_id, paymentHash: $payment_hash}'
  )
  exec_graphql "$BOB" 'transactions-for-wallet-by-payment-hash' "$variables"
  recipient_memo="$(graphql_output '.data.me.defaultAccount.walletById.transactionsByPaymentHash[0].memo')"
  [[ "${recipient_memo}" == "${comment}" ]] || exit 1

  # The comment does not leak to the sender side
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_hash "$payment_hash" \
    '{walletId: $wallet_id, paymentHash: $payment_hash}'
  )
  exec_graphql "$token_name" 'transactions-for-wallet-by-payment-hash' "$variables"
  sender_memo="$(graphql_output '.data.me.defaultAccount.walletById.transactionsByPaymentHash[0].memo')"
  [[ "${sender_memo}" == "null" ]] || exit 1
}

@test "ln-send: intraledger settled - lnInvoicePaymentSend from usd to btc" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"
  external_id="external-id-2"

  create_user "$BOB"
  user_update_username "$BOB"
  bob_btc_wallet_name="$BOB.btc_wallet_id"

  initial_recipient_balance="$(balance_for_wallet $BOB 'BTC')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_btc_wallet_name)" \
    --arg amount "$btc_amount" \
    --arg external_id "$external_id" \
    '{input: {walletId: $wallet_id, amount: $amount, externalId: $external_id}}'
  )
  exec_graphql "$BOB" 'ln-invoice-create' "$variables"
  invoice="$(graphql_output '.data.lnInvoiceCreate.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1
  payment_external_id="$(echo $invoice | jq -r '.externalId')"
  [[ "${payment_external_id}" == "${external_id}" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )

  exec_graphql "$token_name" 'ln-usd-invoice-fee-probe' "$variables"
  fee_amount="$(graphql_output '.data.lnUsdInvoiceFeeProbe.amount')"
  [[ "${fee_amount}" = "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  transaction_payment_pre_image="$(graphql_output '.data.lnInvoicePaymentSend.transaction.settlementVia.preImage')"
  transaction_payment_hash_from_pre_image=$(echo -n $transaction_payment_pre_image | xxd -r -p | sha256sum | cut -d ' ' -f1)
  [[ "${transaction_payment_hash_from_pre_image}" == "${payment_hash}" ]] || exit 1

  transaction_external_id="$(graphql_output '.data.lnInvoicePaymentSend.transaction.externalId')"
  [[ "${transaction_external_id}" == "${external_id}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  check_for_ln_initiated_settled "$BOB" "$payment_hash"

  tx_query_external_id="$(get_from_transaction_by_ln_hash_and_status $payment_hash 'SUCCESS' '.externalId')"
  [[ "${tx_query_external_id}" == "${external_id}" ]] || exit 1

  final_recipient_balance="$(balance_for_wallet $BOB 'BTC')"
  recipient_wallet_diff="$(( $final_recipient_balance - $initial_recipient_balance ))"
  [[ "$recipient_wallet_diff" == "$btc_amount" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "0" ]] || exit 1
}

@test "ln-send: intraledger settled - lnNoAmountInvoicePaymentSend from btc to usd" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"
  external_id="external-id-3"

  create_user "$BOB"
  user_update_username "$BOB"
  bob_usd_wallet_name="$BOB.usd_wallet_id"

  initial_balance="$(balance_for_wallet $token_name 'BTC')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_usd_wallet_name)" \
    --arg external_id "$external_id" \
    '{input: {walletId: $wallet_id, externalId: $external_id}}'
  )
  exec_graphql "$BOB" 'ln-no-amount-invoice-create' "$variables"
  invoice="$(graphql_output '.data.lnNoAmountInvoiceCreate.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1
  payment_external_id="$(echo $invoice | jq -r '.externalId')"
  [[ "${payment_external_id}" == "${external_id}" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $btc_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  transaction_payment_pre_image="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.transaction.settlementVia.preImage')"
  transaction_payment_hash_from_pre_image=$(echo -n $transaction_payment_pre_image | xxd -r -p | sha256sum | cut -d ' ' -f1)
  [[ "${transaction_payment_hash_from_pre_image}" == "${payment_hash}" ]] || exit 1

  transaction_external_id="$(graphql_output '.data.lnNoAmountInvoicePaymentSend.transaction.externalId')"
  [[ "${transaction_external_id}" == "${external_id}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  check_for_ln_initiated_settled "$BOB" "$payment_hash"

  tx_query_external_id="$(get_from_transaction_by_ln_hash_and_status $payment_hash 'SUCCESS' '.externalId')"
  [[ "${tx_query_external_id}" == "${external_id}" ]] || exit 1

  final_balance="$(balance_for_wallet $token_name 'BTC')"
  wallet_diff="$(( $initial_balance - $final_balance ))"
  [[ "$wallet_diff" == "$btc_amount" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "0" ]] || exit 1
}

@test "ln-send: intraledger settled - lnNoAmountUsdInvoicePaymentSend from usd to usd" {
  token_name="$ALICE"
  usd_wallet_name="$token_name.usd_wallet_id"
  external_id="external-id-4"

  create_user "$BOB"
  user_update_username "$BOB"
  bob_usd_wallet_name="$BOB.usd_wallet_id"

  initial_balance="$(balance_for_wallet $token_name 'USD')"
  initial_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $bob_usd_wallet_name)" \
    --arg external_id "$external_id" \
    '{input: {walletId: $wallet_id, externalId: $external_id}}'
  )
  exec_graphql "$BOB" 'ln-no-amount-invoice-create' "$variables"
  invoice="$(graphql_output '.data.lnNoAmountInvoiceCreate.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1
  payment_external_id="$(echo $invoice | jq -r '.externalId')"
  [[ "${payment_external_id}" == "${external_id}" ]] || exit 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    --arg amount $usd_amount \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request, amount: $amount}}'
  )

  exec_graphql "$token_name" 'ln-no-amount-usd-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  transaction_payment_pre_image="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.transaction.settlementVia.preImage')"
  transaction_payment_hash_from_pre_image=$(echo -n $transaction_payment_pre_image | xxd -r -p | sha256sum | cut -d ' ' -f1)
  [[ "${transaction_payment_hash_from_pre_image}" == "${payment_hash}" ]] || exit 1

  transaction_external_id="$(graphql_output '.data.lnNoAmountUsdInvoicePaymentSend.transaction.externalId')"
  [[ "${transaction_external_id}" == "${external_id}" ]] || exit 1

  # Check for settled
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  check_for_ln_initiated_settled "$BOB" "$payment_hash"

  tx_query_external_id="$(get_from_transaction_by_ln_hash_and_status $payment_hash 'SUCCESS' '.externalId')"
  [[ "${tx_query_external_id}" == "${external_id}" ]] || exit 1

  final_balance="$(balance_for_wallet $token_name 'USD')"
  wallet_diff="$(( $initial_balance - $final_balance ))"
  [[ "$wallet_diff" == "$usd_amount" ]] || exit 1

  final_lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  lnd1_diff="$(( $initial_lnd1_balance - $final_lnd1_balance ))"
  [[ "$lnd1_diff" == "0" ]] || exit 1
}

@test "ln-send: ln settled - settle failed and then successful payment" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  threshold_amount=150000
  invoice_response="$(lnd_outside_2_cli addinvoice --amt $threshold_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  payment_hash=$(echo $invoice_response | jq -r '.r_hash')
  [[ "${payment_request}" != "null" ]] || exit 1

  check_num_txns() {
    expected_num="$1"

    num_txns="$(num_txns_for_hash "$token_name" "$payment_hash")"
    [[ "$num_txns" == "$expected_num" ]] || exit 1
  }

  # Rebalance last hop so payment will fail
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount - 1 ))"

  # Try payment and check for fail
  initial_balance="$(balance_for_wallet $token_name 'BTC')"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  error_msg="$(graphql_output '.data.lnInvoicePaymentSend.errors[0].message')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1
  [[ "${error_msg}" == "Unable to find a route for payment." ]] || exit 1

  # Check for callback
  num_callback_events_fail=$(cat_callback | grep "$payment_hash" | grep "failure" | wc -l)
  [[ "${num_callback_events_fail}" == "1" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "2"
  balance_after_fail="$(balance_for_wallet $token_name 'BTC')"
  [[ "$initial_balance" == "$balance_after_fail" ]] || exit 1

  statusAfterFail="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterFail}" == "FAILURE" ]] || exit 1

  # Rebalance last hop so same payment will succeed
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount * 2 ))"
  lnd_cli resetmc

  # Retry payment and check for success
  exec_graphql "$token_name" 'ln-invoice-fee-probe' "$variables"
  num_errors="$(graphql_output '.data.lnInvoiceFeeProbe.errors | length')"
  fee_amount="$(graphql_output '.data.lnInvoiceFeeProbe.amount')"
  [[ "$num_errors" == "0" ]] || exit 1
  [[ "${fee_amount}" -gt "0" ]] || exit 1

  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for callback
  num_callback_events=$(cat_callback | grep "$payment_hash" | grep "success" | wc -l)
  [[ "${num_callback_events}" == "1" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "3"
  balance_after_success="$(balance_for_wallet $token_name 'BTC')"
  [[ "$balance_after_success" -lt "$initial_balance" ]] || exit 1

  statusAfterSuccess="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterSuccess}" == "SUCCESS" ]] || exit 1

  # Correct millisat imbalance from "1.15 sat" fee
  imbalance_msat="850"
  payment_request="$(lnd_outside_cli addinvoice --amt_msat $imbalance_msat | jq -r '.payment_request')"
  lnd_cli payinvoice -f "$payment_request"
}

@test "ln-send: ln settled - settle failed and then pending-to-failed payment" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"

  threshold_amount=150000
  secret=$(xxd -l 32 -c 256 -p /dev/urandom)
  payment_hash=$(echo -n $secret | xxd -r -p | sha256sum | cut -d ' ' -f1)
  invoice_response="$(lnd_outside_2_cli addholdinvoice $payment_hash --amt $threshold_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  [[ "${payment_request}" != "null" ]] || exit 1

  check_num_txns() {
    expected_num="$1"

    num_txns="$(num_txns_for_hash "$token_name" "$payment_hash")"
    [[ "$num_txns" == "$expected_num" ]] || exit 1
  }

  # Rebalance last hop so payment will fail
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount - 1 ))"

  # Try payment and check for fail
  initial_balance="$(balance_for_wallet $token_name 'BTC')"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  error_msg="$(graphql_output '.data.lnInvoicePaymentSend.errors[0].message')"
  [[ "${send_status}" = "FAILURE" ]] || exit 1
  [[ "${error_msg}" == "Unable to find a route for payment." ]] || exit 1

  # Check for callback
  num_callback_events_fail=$(cat_callback | grep "$payment_hash" | grep "failure" | wc -l)
  [[ "${num_callback_events_fail}" == "1" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "2"
  balance_after_fail="$(balance_for_wallet $token_name 'BTC')"
  [[ "$initial_balance" == "$balance_after_fail" ]] || exit 1

  statusAfterFail="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterFail}" == "FAILURE" ]] || exit 1

  # Rebalance last hop so same payment will succeed
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount * 2 ))"
  lnd_cli resetmc

  # Retry payment and check for pending
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "PENDING" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for callback
  num_callback_events_pending=$(cat_callback | grep "$payment_hash" | grep "pending" | wc -l)
  [[ "${num_callback_events_pending}" == "1" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "3"
  run check_for_ln_initiated_pending "$token_name" "$payment_hash" "10" \
    || exit 1
  balance_while_pending="$(balance_for_wallet $token_name 'BTC')"
  [[ "$balance_while_pending" -lt "$initial_balance" ]] || exit 1

  statusAfterPending="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterPending}" == "PENDING" ]] || exit 1

  # Cancel hodl invoice
  lnd_outside_2_cli cancelinvoice "$payment_hash"

  # Check for txns
  retry 15 1 check_num_txns "4"
  balance_after_pending_failed="$(balance_for_wallet $token_name 'BTC')"
  [[ "$balance_after_pending_failed" == "$initial_balance" ]] || exit 1

  run check_for_ln_initiated_pending "$token_name" "$payment_hash" "10"
  [[ "$status" -ne 0 ]] || exit 1

  statusAfterFail="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterFail}" == "FAILURE" ]] || exit 1

  # Check for callback
  num_callback_events_fail=$(cat_callback | grep "$payment_hash" | grep "failure" | wc -l)
  [[ "${num_callback_events_fail}" == "2" ]] || exit 1
}

@test "ln-send: ln settled - pending-to-failed usd payment" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"
  usd_wallet_name="$token_name.usd_wallet_id"

  threshold_amount=150000
  secret=$(xxd -l 32 -c 256 -p /dev/urandom)
  payment_hash=$(echo -n $secret | xxd -r -p | sha256sum | cut -d ' ' -f1)
  invoice_response="$(lnd_outside_2_cli addholdinvoice $payment_hash --amt $threshold_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  [[ "${payment_request}" != "null" ]] || exit 1

  check_num_txns() {
    expected_num="$1"

    num_txns="$(num_txns_for_hash "$token_name" "$payment_hash")"
    [[ "$num_txns" == "$expected_num" ]] || exit 1
  }

  initial_btc_balance="$(balance_for_wallet $token_name 'BTC')"
  initial_usd_balance="$(balance_for_wallet $token_name 'USD')"

  # Rebalance last hop so payment will succeed
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount * 2 ))"
  lnd_cli resetmc

  # Try payment and check for pending
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "PENDING" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "1"
  run check_for_ln_initiated_pending "$token_name" "$payment_hash" "10" \
    || exit 1
  btc_balance_while_pending="$(balance_for_wallet $token_name 'BTC')"
  usd_balance_while_pending="$(balance_for_wallet $token_name 'USD')"
  [[ "$btc_balance_while_pending" == "$initial_btc_balance" ]] || exit 1
  [[ "$usd_balance_while_pending" -lt "$initial_usd_balance" ]] || exit 1

  statusAfterPending="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterPending}" == "PENDING" ]] || exit 1

  # Cancel hodl invoice
  lnd_outside_2_cli cancelinvoice "$payment_hash"

  retry 15 1 check_num_txns "2"
  btc_balance_after_pending_failed="$(balance_for_wallet $token_name 'BTC')"
  usd_balance_after_pending_failed="$(balance_for_wallet $token_name 'USD')"
  [[ "$btc_balance_after_pending_failed" -gt "$btc_balance_while_pending" ]] || exit 1
  [[ "$usd_balance_after_pending_failed" == "$usd_balance_while_pending" ]] || exit 1

  run check_for_ln_initiated_pending "$token_name" "$payment_hash" "10"
  [[ "$status" -ne 0 ]] || exit 1

  statusAfterFail="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterFail}" == "FAILURE" ]] || exit 1
}

@test "ln-send: ln settled - pending-to-success usd payment" {
  token_name="$ALICE"
  btc_wallet_name="$token_name.btc_wallet_id"
  usd_wallet_name="$token_name.usd_wallet_id"

  threshold_amount=150000
  secret=$(xxd -l 32 -c 256 -p /dev/urandom)
  payment_hash=$(echo -n $secret | xxd -r -p | sha256sum | cut -d ' ' -f1)
  invoice_response="$(lnd_outside_2_cli addholdinvoice $payment_hash --amt $threshold_amount)"
  payment_request="$(echo $invoice_response | jq -r '.payment_request')"
  [[ "${payment_request}" != "null" ]] || exit 1

  check_num_txns() {
    expected_num="$1"

    num_txns="$(num_txns_for_hash "$token_name" "$payment_hash")"
    [[ "$num_txns" == "$expected_num" ]] || exit 1
  }

  initial_btc_balance="$(balance_for_wallet $token_name 'BTC')"
  initial_usd_balance="$(balance_for_wallet $token_name 'USD')"

  # Rebalance last hop so payment will succeed
  rebalance_channel lnd_outside_cli lnd_outside_2_cli "$(( $threshold_amount * 2 ))"
  lnd_cli resetmc

  # Try payment and check for pending
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg payment_request "$payment_request" \
    '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$token_name" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "${send_status}" = "PENDING" ]] || exit 1

  transaction_payment_hash="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentHash')"
  [[ "${transaction_payment_hash}" == "${payment_hash}" ]] || exit 1

  transaction_payment_request="$(graphql_output '.data.lnInvoicePaymentSend.transaction.initiationVia.paymentRequest')"
  [[ "${transaction_payment_request}" == "${payment_request}" ]] || exit 1

  # Check for callback
  num_callback_events_pending=$(cat_callback | grep "$payment_hash" | grep "pending" | wc -l)
  [[ "${num_callback_events_pending}" == "1" ]] || exit 1

  # Check for txns
  retry 15 1 check_num_txns "1"
  run check_for_ln_initiated_pending "$token_name" "$payment_hash" "10" \
    || exit 1
  btc_balance_while_pending="$(balance_for_wallet $token_name 'BTC')"
  usd_balance_while_pending="$(balance_for_wallet $token_name 'USD')"
  [[ "$btc_balance_while_pending" == "$initial_btc_balance" ]] || exit 1
  [[ "$usd_balance_while_pending" -lt "$initial_usd_balance" ]] || exit 1

  statusAfterPending="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterPending}" == "PENDING" ]] || exit 1

  # Settle hodl invoice
  res=$(lnd_outside_2_cli settleinvoice "$secret")

  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  btc_balance_after_pending_success="$(balance_for_wallet $token_name 'BTC')"
  usd_balance_after_pending_success="$(balance_for_wallet $token_name 'USD')"
  [[ "$btc_balance_after_pending_success" == "$initial_btc_balance" ]] || exit 1
  [[ "$usd_balance_after_pending_success" -lt "$initial_usd_balance" ]] || exit 1

  statusAfterSuccess="$(txns_for_hash "$token_name" "$payment_hash" | jq -r '.[0].node.status')"
  [[ "${statusAfterSuccess}" == "SUCCESS" ]] || exit 1

  # Check for callback
  num_callback_events=$(cat_callback | grep "$payment_hash" | grep "success" | wc -l)
  [[ "${num_callback_events}" == "1" ]] || exit 1

  # Correct millisat imbalance from "1.15 sat" fee
  imbalance_msat="850"
  payment_request="$(lnd_outside_cli addinvoice --amt_msat $imbalance_msat | jq -r '.payment_request')"
  lnd_cli payinvoice -f "$payment_request"
}
