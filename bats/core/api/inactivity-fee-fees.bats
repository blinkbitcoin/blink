#!/usr/bin/env bats

# Inactivity-fee fee job end-to-end through the on-demand runner: the dry run the CCO
# approves, the live debit at the dealer's pinned rate, the idempotent second run, the sub-$1
# whole-balance case, the 31-day worklist filter and the refund path once the user returns. The
# runner bypasses the cron gate, which is pinned by unit tests. The dev stack's config has
# liveCharging off: the live cases hand the runner a custom yaml that turns it on.
#
# The dev database holds whatever the sibling inactivity-fee files left behind, and every run
# scans all of it, so each case asserts its own account's CSV rows and ledger movements rather
# than run-wide totals.
#
# Every authenticated call runs the session middleware, which rewrites the caller's
# last_activity_at to now and, when the previous value was dormant, reactivates the account
# (refunding fees, retiring its notice): balances that must not trigger it are read from the
# ledger through mongo, and the clock is back-dated right before each run that must charge.

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"
load "../../helpers/wallet.bash"

ALICE='alice'
BOB='bob'
CAROL='carol'

FEE_CENTS=100

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
  # a Dollar Balance under $1 at any plausible dev price
  create_user "$BOB"
  fund_user_lightning "$BOB" "$BOB.usd_wallet_id" 500
  create_user "$CAROL"
  fund_user_lightning "$CAROL" "$CAROL.btc_wallet_id" 10000

  # effectiveFrom gates the charge, so both runs need a date already past: galoy.yaml ships
  # 2026-10-15, and until that day every wallet would skip before_effective_from and these
  # cases would pass by asserting nothing. The dry run needs the yaml for that reason alone.
  printf 'inactivityFee:\n  effectiveFrom: "2020-01-01T00:00:00Z"\n' > "${BATS_FILE_TMPDIR}/dry.yaml"
  printf 'inactivityFee:\n  effectiveFrom: "2020-01-01T00:00:00Z"\n  liveCharging: true\n' > "${BATS_FILE_TMPDIR}/live.yaml"
}

setup() {
  DIAG_ACCOUNT_ID=''
  DIAG_CSV=''
}

teardown() {
  assert_balance_for_check
}

# runs a check; the diagnostics are dumped only when it is about to fail the test
ok() {
  "$@" && return 0
  dump_diagnostics "$DIAG_CSV" "$DIAG_ACCOUNT_ID"
  exit 1
}

today_utc() {
  date -u +%Y-%m-%d
}

this_month() {
  date -u +%Y-%m
}

# bounded: a runner that never exits must fail this test, not the job's timeout. The forwarded
# "--" is dropped by the runner before the config loader reads the yaml path.
run_fee_job_dry() {
  local out="${BATS_TEST_TMPDIR}/fee-dry-$(date +%s%N).csv"
  timeout 600 buck2 run //core/api:dev-inactivity-fee-job -- "${BATS_FILE_TMPDIR}/dry.yaml" fee --as-of "$(today_utc)" --out "$out" > .e2e-inactivity-fee-fee-job.log
  echo "$out"
}

run_fee_job_live() {
  local out="${BATS_TEST_TMPDIR}/fee-live-$(date +%s%N).csv"
  timeout 600 buck2 run //core/api:dev-inactivity-fee-job -- "${BATS_FILE_TMPDIR}/live.yaml" fee --as-of "$(today_utc)" --live --out "$out" > .e2e-inactivity-fee-fee-job.log
  echo "$out"
}

# CSV: account_id,wallet_id,currency,outcome,reason,amount,external_id,notice_id
csv_wallet_field() {
  local csv=$1 account_id=$2 currency=$3 field=$4
  grep "^${account_id},[^,]*,${currency}," "$csv" | cut -d, -f"$field"
}

# an account the worklist never yielded has no row at all; an account-level skip would be one
# row with the wallet columns empty
csv_row_count() {
  local csv=$1 account_id=$2
  grep -c "^${account_id}," "$csv" || true
}

summary_field() {
  local csv=$1 filter=$2
  jq -r "$filter" "${csv}.summary.json"
}

# mongo_cli word-splits its argument, so the command must not contain whitespace.
ledger_balance() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.aggregate([{\$match:{accounts:'Liabilities:${wallet_id}'}},{\$group:{_id:null,b:{\$sum:{\$subtract:['\$credit','\$debit']}}}}]).toArray()[0].b"
}

fee_count() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee'})"
}

fee_count_with() {
  local wallet_id=$1 external_id=$2 debit=$3 notice_id=$4
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee',external_id:'${external_id}',debit:${debit},rateSource:'dealer-mid',configVersion:'dev',noticeId:'${notice_id}',runId:/^fee-/,rate:{\$gt:0}})"
}

fee_memo() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.findOne({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee'}).memoPayer"
}

refund_count() {
  local wallet_id=$1
  mongo_cli "db.medici_transactions.countDocuments({accounts:'Liabilities:${wallet_id}',type:'inactivity_fee_refund'})"
}

# returns the inserted row's id
insert_live_notice_days_ago() {
  local account_id=$1 days=$2
  local issued_at
  issued_at="$(date -u -d "${days} days ago" +%Y-%m-%dT%H:%M:%SZ)"
  mongo_cli "db.inactivityfeenotices.insertOne({accountId:'${account_id}',issuedAt:ISODate('${issued_at}'),templateVersion:'notice-v1',bulletinIssued:true,pushSent:false,status:'active',source:'notice-job',createdAt:ISODate(),updatedAt:ISODate()}).insertedId.toString()"
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

# bats shows a test's output only when it fails: the runner's stdout, the account's CSV rows
# and the run summary are the only way to see *why* an outcome was not the expected one in CI
dump_diagnostics() {
  local csv=$1 account_id=$2
  echo "--- runner log"; cat .e2e-inactivity-fee-fee-job.log 2>/dev/null || true
  if [[ -n "$csv" ]]; then
    echo "--- csv rows for ${account_id}"; grep "^${account_id}," "$csv" || echo "(no row)"
    echo "--- summary"; cat "${csv}.summary.json" 2>/dev/null || true
  fi
  if [[ -n "$account_id" ]]; then
    echo "--- notice rows"; mongo_cli "db.inactivityfeenotices.find({accountId:'${account_id}'}).toArray()"
  fi
}

@test "inactivity-fee-fees: the dry run reports would-charge rows at the pinned rate and posts nothing" {
  local account_id btc_wallet_id usd_wallet_id notice_id
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  DIAG_ACCOUNT_ID="$account_id"

  notice_id="$(insert_live_notice_days_ago "$account_id" 40)"
  cache_value "$ALICE.notice_id" "$notice_id"
  back_date_clock_13_months "$account_id"
  cache_value "$ALICE.btc_before" "$(ledger_balance "$btc_wallet_id")"
  cache_value "$ALICE.usd_before" "$(ledger_balance "$usd_wallet_id")"

  csv="$(run_fee_job_dry)"
  DIAG_CSV="$csv"

  # the run-wide fields; every count below is alice's own rows, since other accounts in the
  # dev database (the sibling bats files leave some behind) are scanned by the same run
  ok test "$(summary_field "$csv" '.mode')" = "dry"
  ok test "$(summary_field "$csv" '.rateSource')" = "dealer-mid"
  ok test "$(summary_field "$csv" '.rate | round')" -gt 0
  ok test "$(summary_field "$csv" '.debited.count')" -eq 0

  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 4)" = "would_charge"
  # the sats are the job's own arithmetic at the pinned rate; the live case proves the ledger
  # moves exactly this much
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 6)" -gt 0
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 7)" = "ifee_${btc_wallet_id}_$(this_month)"
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 8)" = "$notice_id"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 4)" = "would_charge"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 6)" -eq "$FEE_CENTS"

  ok test "$(fee_count "$btc_wallet_id")" -eq 0
  ok test "$(fee_count "$usd_wallet_id")" -eq 0
  ok test "$(ledger_balance "$btc_wallet_id")" -eq "$(read_value "$ALICE.btc_before")"
}

@test "inactivity-fee-fees: the live run debits both balances at the summary's rate with the provenance stamped" {
  local account_id btc_wallet_id usd_wallet_id notice_id month
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  notice_id="$(read_value "$ALICE.notice_id")"
  month="$(this_month)"
  DIAG_ACCOUNT_ID="$account_id"

  btc_before="$(read_value "$ALICE.btc_before")"
  usd_before="$(read_value "$ALICE.usd_before")"
  back_date_clock_13_months "$account_id"

  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"

  # The run also scans whatever else the dev database holds, so the summary is only asked for
  # the run-wide facts; what alice paid is her own CSV row, and the ledger has to agree with it
  # exactly — sats are never recomputed here from a rounded rate.
  ok test "$(summary_field "$csv" '.mode')" = "live"
  ok test "$(summary_field "$csv" '.rateSource')" = "dealer-mid"
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 4)" = "charged"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 4)" = "charged"

  local fee_sats fee_cents
  fee_sats="$(csv_wallet_field "$csv" "$account_id" BTC 6)"
  fee_cents="$(csv_wallet_field "$csv" "$account_id" USD 6)"
  cache_value "$ALICE.fee_sats" "$fee_sats"
  ok test "$fee_sats" -gt 0
  ok test "$fee_cents" -eq "$FEE_CENTS"

  ok test $((btc_before - $(ledger_balance "$btc_wallet_id"))) -eq "$fee_sats"
  ok test $((usd_before - $(ledger_balance "$usd_wallet_id"))) -eq "$fee_cents"
  ok test "$(fee_count_with "$btc_wallet_id" "ifee_${btc_wallet_id}_${month}" "$fee_sats" "$notice_id")" -eq 1
  ok test "$(fee_count_with "$usd_wallet_id" "ifee_${usd_wallet_id}_${month}" "$fee_cents" "$notice_id")" -eq 1

  # read from the row, not the API: an authenticated call would reactivate alice
  btc_memo="$(fee_memo "$btc_wallet_id")"
  [[ "$btc_memo" =~ ^"Inactivity fee — \$1.00 ("[0-9,]+" sats at \$"[0-9,]+"/BTC)"$ ]] || ok false
  ok test "$(fee_memo "$usd_wallet_id")" = "Inactivity fee — \$1.00"
}

@test "inactivity-fee-fees: a second live run posts nothing already posted" {
  local account_id btc_wallet_id usd_wallet_id
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  DIAG_ACCOUNT_ID="$account_id"

  btc_after="$(ledger_balance "$btc_wallet_id")"
  usd_after="$(ledger_balance "$usd_wallet_id")"

  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"

  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 4)" = "skipped"
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 5)" = "already_debited"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 5)" = "already_debited"
  ok test "$(fee_count "$btc_wallet_id")" -eq 1
  ok test "$(fee_count "$usd_wallet_id")" -eq 1
  ok test "$(ledger_balance "$btc_wallet_id")" -eq "$btc_after"
  ok test "$(ledger_balance "$usd_wallet_id")" -eq "$usd_after"
}

@test "inactivity-fee-fees: a sub-\$1 Dollar Balance is taken whole, then skipped as zero_balance" {
  local account_id btc_wallet_id usd_wallet_id
  account_id="$(read_value "$BOB.account_id")"
  btc_wallet_id="$(read_value "$BOB.btc_wallet_id")"
  usd_wallet_id="$(read_value "$BOB.usd_wallet_id")"
  DIAG_ACCOUNT_ID="$account_id"

  insert_live_notice_days_ago "$account_id" 40 > /dev/null
  back_date_clock_13_months "$account_id"
  usd_before="$(ledger_balance "$usd_wallet_id")"
  ok test "$usd_before" -gt 0
  ok test "$usd_before" -lt "$FEE_CENTS"

  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"

  ok test "$(csv_wallet_field "$csv" "$account_id" USD 4)" = "charged"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 6)" -eq "$usd_before"
  ok test "$(csv_wallet_field "$csv" "$account_id" BTC 5)" = "zero_balance"
  ok test "$(ledger_balance "$usd_wallet_id")" -eq 0
  ok test "$(fee_count "$usd_wallet_id")" -eq 1
  ok test "$(fee_count "$btc_wallet_id")" -eq 0

  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"
  ok test "$(csv_wallet_field "$csv" "$account_id" USD 5)" = "zero_balance"
  ok test "$(fee_count "$usd_wallet_id")" -eq 1
}

# The worklist is {status: active, issuedAt <= asOf - 31d}, so an account whose only notice is
# younger than that is never scanned at all: it has no CSV row, not a notice_too_young one.
# (The predicate's notice_too_young reason covers the race where the row changes between the
# scan and the read under the lock, and is unit-tested.)
@test "inactivity-fee-fees: an account whose notice is younger than 31 days is never scanned" {
  local account_id btc_wallet_id
  account_id="$(read_value "$CAROL.account_id")"
  btc_wallet_id="$(read_value "$CAROL.btc_wallet_id")"
  DIAG_ACCOUNT_ID="$account_id"

  insert_live_notice_days_ago "$account_id" 10 > /dev/null
  back_date_clock_13_months "$account_id"

  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"

  ok test "$(csv_row_count "$csv" "$account_id")" -eq 0
  ok test "$(fee_count "$btc_wallet_id")" -eq 0
}

@test "inactivity-fee-fees: the returning user is refunded and is not scanned again" {
  local account_id btc_wallet_id usd_wallet_id
  account_id="$(read_value "$ALICE.account_id")"
  btc_wallet_id="$(read_value "$ALICE.btc_wallet_id")"
  usd_wallet_id="$(read_value "$ALICE.usd_wallet_id")"
  DIAG_ACCOUNT_ID="$account_id"

  # one authenticated query: the refund is already there when it returns
  ok test "$(balance_for_wallet "$ALICE" 'BTC')" -eq "$(read_value "$ALICE.btc_before")"
  ok test "$(ledger_balance "$usd_wallet_id")" -eq "$(read_value "$ALICE.usd_before")"
  ok test "$(refund_count "$btc_wallet_id")" -eq 1
  ok test "$(refund_count "$usd_wallet_id")" -eq 1
  ok test "$(notice_count "$account_id" "status:'active'")" -eq 0
  ok test "$(notice_count "$account_id" "status:'superseded',supersededReason:'reactivation'")" -eq 1

  # the debit and its refund both show in history
  exec_graphql "$ALICE" 'transactions-by-wallet' '{"first": 10}'
  fee_memo="$(graphql_output '[.data.me.defaultAccount.wallets[] | select(.walletCurrency == "BTC") | .transactions.edges[].node.memo] | map(select(. != null and startswith("Inactivity fee —"))) | .[0]')"
  [[ "$fee_memo" =~ ^"Inactivity fee — \$1.00 ("[0-9,]+" sats at \$"[0-9,]+"/BTC)"$ ]] || ok false
  refund_memo="$(graphql_output '[.data.me.defaultAccount.wallets[] | select(.walletCurrency == "USD") | .transactions.edges[].node.memo] | map(select(. != null and startswith("Inactivity fee refund"))) | .[0]')"
  ok test "$refund_memo" = "Inactivity fee refund — \$1.00"

  # Dormant again, but the reactivation superseded her notice: the worklist only yields active
  # rows, so she is out of it entirely — no row in the report, and nothing further charged.
  back_date_clock_13_months "$account_id"
  csv="$(run_fee_job_live)"
  DIAG_CSV="$csv"
  ok test "$(csv_row_count "$csv" "$account_id")" -eq 0
  ok test "$(fee_count "$btc_wallet_id")" -eq 1
  ok test "$(fee_count "$usd_wallet_id")" -eq 1
}
