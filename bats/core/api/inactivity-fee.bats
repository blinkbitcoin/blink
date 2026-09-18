#!/usr/bin/env bats

# The "leaves it" cases assume activityRefreshIntervalSec (default 3600) outlasts the test run.

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"

ALICE='alice'
BOB='bob'

setup_file() {
  clear_cache

  lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  if [[ $lnd1_balance -lt "1000000" ]]; then
    create_user 'lnd_funding'
    fund_user_lightning 'lnd_funding' 'lnd_funding.btc_wallet_id' '5000000'
  fi

  create_user "$ALICE"
  create_user "$BOB"
}

teardown() {
  assert_balance_for_check
}

# mongo_cli word-splits its argument: no whitespace in the command.
last_activity_ms() {
  local account_id=$1
  mongo_cli "db.accounts.findOne({id:'${account_id}'}).last_activity_at.getTime()"
}

@test "inactivity-fee: login on an existing account bumps last_activity_at" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  before="$(last_activity_ms "$account_id")"
  [[ "$before" =~ ^[0-9]+$ ]] || exit 1

  sleep 1
  login_user "$ALICE" "$(read_value "$ALICE.phone")"

  after="$(last_activity_ms "$account_id")"
  [[ "$after" =~ ^[0-9]+$ ]] || exit 1
  [[ "$after" -gt "$before" ]] || exit 1

  cache_value "$ALICE.last_activity_ms" "$after"
}

@test "inactivity-fee: an authenticated query inside the refresh interval leaves it" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"
  local before
  before="$(read_value "$ALICE.last_activity_ms")"

  sleep 1
  exec_graphql "$ALICE" 'default-account'
  [[ "$(graphql_output '.data.me.defaultAccount.id')" = "$account_id" ]] || exit 1

  after="$(last_activity_ms "$account_id")"
  [[ "$after" -eq "$before" ]] || exit 1
}

@test "inactivity-fee: receiving a payment leaves it" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  before="$(last_activity_ms "$account_id")"
  sleep 1
  fund_user_lightning "$ALICE" "$ALICE.btc_wallet_id" 10000

  after="$(last_activity_ms "$account_id")"
  [[ "$after" -eq "$before" ]] || exit 1
}

@test "inactivity-fee: a session request after the refresh interval rewrites a stale value" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$set:{last_activity_at:ISODate('2020-01-01')}})"
  stale="$(last_activity_ms "$account_id")"
  [[ "$stale" -eq "$(date -u -d '2020-01-01' +%s)000" ]] || exit 1

  exec_graphql "$ALICE" 'default-account'
  [[ "$(graphql_output '.data.me.defaultAccount.id')" = "$account_id" ]] || exit 1

  after="$(last_activity_ms "$account_id")"
  now_ms="$(date +%s)000"
  [[ "$after" -gt "$stale" ]] || exit 1
  [[ $((now_ms - after)) -lt 60000 ]] || exit 1
}

@test "inactivity-fee: a session request sets a missing value" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$unset:{last_activity_at:''}})"
  missing="$(mongo_cli "db.accounts.countDocuments({id:'${account_id}',last_activity_at:null})")"
  [[ "$missing" -eq 1 ]] || exit 1

  exec_graphql "$ALICE" 'default-account'
  [[ "$(graphql_output '.data.me.defaultAccount.id')" = "$account_id" ]] || exit 1

  after="$(last_activity_ms "$account_id")"
  [[ "$after" =~ ^[0-9]+$ ]] || exit 1
  now_ms="$(date +%s)000"
  [[ $((now_ms - after)) -lt 60000 ]] || exit 1
}

@test "inactivity-fee: an intraledger send counts as activity for the sender, not the recipient" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"
  local bob_account_id
  bob_account_id="$(read_value "$BOB.account_id")"

  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$set:{last_activity_at:ISODate('2020-01-01')}})"
  before="$(last_activity_ms "$account_id")"
  bob_before="$(last_activity_ms "$bob_account_id")"
  sleep 1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value "$ALICE.btc_wallet_id")" \
    --arg recipient_wallet_id "$(read_value "$BOB.btc_wallet_id")" \
    --arg amount "1000" \
    '{input: {walletId: $wallet_id, recipientWalletId: $recipient_wallet_id, amount: $amount}}'
  )
  exec_graphql "$ALICE" 'intraledger-payment-send' "$variables"
  send_status="$(graphql_output '.data.intraLedgerPaymentSend.status')"
  [[ "${send_status}" = "SUCCESS" ]] || exit 1

  after="$(last_activity_ms "$account_id")"
  [[ "$after" -gt "$before" ]] || exit 1

  bob_after="$(last_activity_ms "$bob_account_id")"
  [[ "$bob_after" -eq "$bob_before" ]] || exit 1
}

@test "inactivity-fee: an external lightning send counts as activity" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$set:{last_activity_at:ISODate('2020-01-01')}})"
  before="$(last_activity_ms "$account_id")"
  sleep 1

  invoice_response="$(lnd_outside_cli addinvoice --amt 1000)"
  payment_request="$(echo "$invoice_response" | jq -r '.payment_request')"
  payment_hash="$(echo "$invoice_response" | jq -r '.r_hash')"
  [[ "$payment_request" != "null" ]] || exit 1

  variables=$(
    jq -n \
      --arg wallet_id "$(read_value "$ALICE.btc_wallet_id")" \
      --arg payment_request "$payment_request" \
      '{input: {walletId: $wallet_id, paymentRequest: $payment_request}}'
  )
  exec_graphql "$ALICE" 'ln-invoice-payment-send' "$variables"
  send_status="$(graphql_output '.data.lnInvoicePaymentSend.status')"
  [[ "$send_status" = "SUCCESS" ]] || exit 1

  retry 15 1 check_for_ln_initiated_settled "$ALICE" "$payment_hash"

  after="$(last_activity_ms "$account_id")"
  [[ "$after" -gt "$before" ]] || exit 1
}
