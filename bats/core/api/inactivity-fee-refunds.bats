#!/usr/bin/env bats

# Inactivity-fee refunds end-to-end: a returning user's first authenticated request refunds
# every fee debit before it returns, exactly once, and the claims path refunds a closed account.
# Nothing posts a debit yet, so debits are seeded through the ledger facade by the fixture in
# src/debug.
#
# Every authenticated call runs the session middleware, which rewrites the caller's
# last_activity_at to now and fires reactivation when the previous value was dormant: balances
# that must not trigger it are read from the ledger through mongo.

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"
load "../../helpers/wallet.bash"

ALICE='alice'
BOB='bob'

BTC_FEE_SATS=1289
BTC_FEE_CENTS=100
USD_FEE_SATS=773
USD_FEE_CENTS=60

setup_file() {
  clear_cache

  lnd1_balance=$(lnd_cli channelbalance | jq -r '.balance')
  if [[ $lnd1_balance -lt "1000000" ]]; then
    create_user 'lnd_funding'
    fund_user_lightning 'lnd_funding' 'lnd_funding.btc_wallet_id' '5000000'
  fi

  create_user "$ALICE"
  fund_user_lightning "$ALICE" "$ALICE.btc_wallet_id" 10000
  fund_user_lightning "$ALICE" "$ALICE.usd_wallet_id" 10000
  create_user "$BOB"
  fund_user_lightning "$BOB" "$BOB.btc_wallet_id" 10000
}

setup() {
  : > .e2e-inactivity-fee-seed.log
  : > .e2e-inactivity-fee-refund.log
  DIAG_WALLET_ID=''
}

teardown() {
  assert_balance_for_check
}

# runs a check; the diagnostics are dumped only when it is about to fail the test
ok() {
  "$@" && return 0
  dump_diagnostics "$DIAG_WALLET_ID"
  exit 1
}

# bounded: a fixture that never exits must fail this test, not the job's timeout
seed_debit() {
  local wallet_id=$1 month=$2 sats=$3 cents=$4 notice_id=$5
  timeout 300 buck2 run //core/api:dev-inactivity-fee-seed-debit -- debit \
    --wallet-id "$wallet_id" --month "$month" --sats "$sats" --cents "$cents" \
    --notice-id "$notice_id" >> .e2e-inactivity-fee-seed.log
}

refund_through_debug_path() {
  local account_id=$1 log=${2:-.e2e-inactivity-fee-refund.log}
  timeout 300 buck2 run //core/api:dev-inactivity-fee-seed-debit -- refund \
    --account-id "$account_id" > "$log"
}

refund_count_for_key() {
  local wallet_id=$1 external_id=$2
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee_refund',external_id:'${external_id}'})"
}

welcome_back_count() {
  local token_name=$1
  exec_graphql "$token_name" 'list-unacknowledged-stateful-notifications-with-bulletin-enabled' > /dev/null
  graphql_output '[.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[] | select(.title == "Welcome back")] | length'
}

# mongo_cli word-splits its argument, so the command must not contain whitespace.
ledger_balance() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.aggregate([{\$match:{accounts:'Liabilities:${wallet_id}'}},{\$group:{_id:null,b:{\$sum:{\$subtract:['\$credit','\$debit']}}}}]).toArray()[0].b"
}

refund_count() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee_refund'})"
}

refund_count_with() {
  local wallet_id=$1 external_id=$2 reason=$3 notice_id=$4 run_prefix=$5 credit=$6
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee_refund',external_id:'${external_id}',refundReason:'${reason}',noticeId:'${notice_id}',runId:/^${run_prefix}-/,credit:${credit}})"
}

insert_live_notice() {
  local account_id=$1
  mongo_cli "db.inactivityfeenotices.insertOne({accountId:'${account_id}',issuedAt:ISODate(),templateVersion:'notice-v1',bulletinIssued:true,pushSent:false,status:'active',source:'notice-job',createdAt:ISODate(),updatedAt:ISODate()})"
}

notice_count() {
  local account_id=$1 filter=$2
  mongo_cli "db.inactivityfeenotices.countDocuments({accountId:'${account_id}',${filter}})"
}

back_date_clock_13_months() {
  local account_id=$1
  local thirteen_months_ago
  thirteen_months_ago="$(date -u -d '13 months ago' +%Y-%m-%dT%H:%M:%SZ)"
  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$set:{last_activity_at:ISODate('${thirteen_months_ago}')}})"
}

dump_diagnostics() {
  local wallet_id=$1
  echo "--- seed log"; cat .e2e-inactivity-fee-seed.log || true
  echo "--- refund logs"; cat .e2e-inactivity-fee-refund*.log 2>/dev/null || true
  echo "--- fee rows"; mongo_cli "db.medici_transactions.find({accounts:'Liabilities:${wallet_id}',type:/^inactivity_fee/}).toArray()"
}

this_month() {
  date -u +%Y-%m
}

@test "inactivity-fee-refunds: the first request of a returning user refunds both balances" {
  local account_id btc_wallet_id usd_wallet_id month
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  month="$(this_month)"
  DIAG_WALLET_ID="$btc_wallet_id"

  btc_before="$(ledger_balance "$btc_wallet_id")"
  usd_before="$(ledger_balance "$usd_wallet_id")"

  seed_debit "$btc_wallet_id" "$month" "$BTC_FEE_SATS" "$BTC_FEE_CENTS" 'notice-e2e'
  seed_debit "$usd_wallet_id" "$month" "$USD_FEE_SATS" "$USD_FEE_CENTS" 'notice-e2e'
  ok test "$(ledger_balance "$btc_wallet_id")" -eq $((btc_before - BTC_FEE_SATS))
  ok test "$(ledger_balance "$usd_wallet_id")" -eq $((usd_before - USD_FEE_CENTS))

  insert_live_notice "$account_id"
  back_date_clock_13_months "$account_id"

  # one authenticated query: the refund is already there when it returns
  ok test "$(balance_for_wallet "$ALICE" 'BTC')" -eq "$btc_before"
  ok test "$(ledger_balance "$usd_wallet_id")" -eq "$usd_before"

  ok test "$(refund_count "$btc_wallet_id")" -eq 1
  ok test "$(refund_count "$usd_wallet_id")" -eq 1
  ok test "$(refund_count_with "$btc_wallet_id" "ifee_refund_${btc_wallet_id}_${month}" 'activity' 'notice-e2e' 'reactivation' "$BTC_FEE_SATS")" -eq 1
  ok test "$(refund_count_with "$usd_wallet_id" "ifee_refund_${usd_wallet_id}_${month}" 'activity' 'notice-e2e' 'reactivation' "$USD_FEE_CENTS")" -eq 1

  ok test "$(notice_count "$account_id" "status:'active'")" -eq 0
  ok test "$(notice_count "$account_id" "status:'superseded',supersededReason:'reactivation'")" -eq 1

  exec_graphql "$ALICE" 'transactions-by-wallet' '{"first": 10}'
  btc_memo="$(graphql_output '[.data.me.defaultAccount.wallets[] | select(.walletCurrency == "BTC") | .transactions.edges[].node.memo] | map(select(. != null and startswith("Inactivity fee refund"))) | .[0]')"
  ok test "$btc_memo" = "Inactivity fee refund — 1,289 sats"
  usd_memo="$(graphql_output '[.data.me.defaultAccount.wallets[] | select(.walletCurrency == "USD") | .transactions.edges[].node.memo] | map(select(. != null and startswith("Inactivity fee refund"))) | .[0]')"
  ok test "$usd_memo" = "Inactivity fee refund — \$0.60"
  fee_memo="$(graphql_output '[.data.me.defaultAccount.wallets[] | select(.walletCurrency == "USD") | .transactions.edges[].node.memo] | map(select(. != null and startswith("Inactivity fee —"))) | .[0]')"
  ok test "$fee_memo" = "Inactivity fee — \$0.60"

  local count
  for i in {1..15}; do
    count="$(welcome_back_count "$ALICE")"
    [[ "$count" -ge 1 ]] && break
    sleep 1
  done
  ok test "$count" -eq 1
  exec_graphql "$ALICE" 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
  body=$(graphql_output '[.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[] | select(.title == "Welcome back")] | .[0].body')
  [[ "$body" == "Welcome back. Your account is active again and the inactivity fee of "* ]] || exit 1
}

@test "inactivity-fee-refunds: a second dormant return posts nothing" {
  local account_id btc_wallet_id usd_wallet_id
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  DIAG_WALLET_ID="$btc_wallet_id"

  btc_before="$(ledger_balance "$btc_wallet_id")"
  back_date_clock_13_months "$account_id"

  ok test "$(balance_for_wallet "$ALICE" 'BTC')" -eq "$btc_before"
  ok test "$(refund_count "$btc_wallet_id")" -eq 1
  ok test "$(refund_count "$usd_wallet_id")" -eq 1

  # nothing was refunded, so no second bulletin; give a stray one time to show up
  sleep 3
  ok test "$(welcome_back_count "$ALICE")" -eq 1
}

@test "inactivity-fee-refunds: two overlapping refund runs post one refund per debit" {
  local account_id btc_wallet_id usd_wallet_id
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  DIAG_WALLET_ID="$btc_wallet_id"

  btc_before="$(ledger_balance "$btc_wallet_id")"
  usd_before="$(ledger_balance "$usd_wallet_id")"

  # another month: the pair posted by the first case stays as it is
  seed_debit "$btc_wallet_id" '2025-01' "$BTC_FEE_SATS" "$BTC_FEE_CENTS" 'notice-parallel'
  seed_debit "$usd_wallet_id" '2025-01' "$USD_FEE_SATS" "$USD_FEE_CENTS" 'notice-parallel'

  # a second session request inside the refresh interval never reaches the handler, so the
  # overlap comes from two runners that both go through the account lock against real Redis
  # and Mongo. The loser may give up on the lock: only the ledger is asserted, not exit codes.
  refund_through_debug_path "$account_id" .e2e-inactivity-fee-refund-1.log &
  local first=$!
  refund_through_debug_path "$account_id" .e2e-inactivity-fee-refund-2.log &
  local second=$!
  wait "$first" || true
  wait "$second" || true

  ok test "$(refund_count_for_key "$btc_wallet_id" "ifee_refund_${btc_wallet_id}_2025-01")" -eq 1
  ok test "$(refund_count_for_key "$usd_wallet_id" "ifee_refund_${usd_wallet_id}_2025-01")" -eq 1
  ok test "$(refund_count "$btc_wallet_id")" -eq 2
  ok test "$(refund_count "$usd_wallet_id")" -eq 2
  ok test "$(ledger_balance "$btc_wallet_id")" -eq "$btc_before"
  ok test "$(ledger_balance "$usd_wallet_id")" -eq "$usd_before"
}

@test "inactivity-fee-refunds: a closed account is refunded through the debug path" {
  local account_id btc_wallet_id
  account_id="$(read_value "$BOB.account_id")"
  btc_wallet_id="$(read_value "$BOB.btc_wallet_id")"
  DIAG_WALLET_ID="$btc_wallet_id"

  btc_before="$(ledger_balance "$btc_wallet_id")"
  seed_debit "$btc_wallet_id" '2026-08' "$BTC_FEE_SATS" "$BTC_FEE_CENTS" 'notice-claims'
  seed_debit "$btc_wallet_id" '2026-09' 1250 "$BTC_FEE_CENTS" 'notice-claims'
  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$push:{statusHistory:{status:'closed',updatedAt:ISODate(),comment:'e2e'}}})"

  refund_through_debug_path "$account_id"

  # the fixture's JSON line sits among the task runner's own output
  ok test "$(grep '^{' .e2e-inactivity-fee-refund.log | tail -n 1 | jq -r '.refundedSats')" -eq $((BTC_FEE_SATS + 1250))
  ok test "$(refund_count_with "$btc_wallet_id" "ifee_refund_${btc_wallet_id}_2026-08" 'claims' 'notice-claims' 'claims' "$BTC_FEE_SATS")" -eq 1
  ok test "$(refund_count_with "$btc_wallet_id" "ifee_refund_${btc_wallet_id}_2026-09" 'claims' 'notice-claims' 'claims' 1250)" -eq 1
  ok test "$(ledger_balance "$btc_wallet_id")" -eq "$btc_before"

  # a second claims run finds the pairs
  refund_through_debug_path "$account_id"
  ok test "$(refund_count "$btc_wallet_id")" -eq 2
}
