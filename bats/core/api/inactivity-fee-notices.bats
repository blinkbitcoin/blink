#!/usr/bin/env bats

# Inactivity-fee notice log end-to-end: the public fee-info field, notice → bulletin through
# the on-demand runner, the stale-row supersede under the partial unique index and the
# zero-balance skip. The runner bypasses the cron gate, which is pinned by unit tests.
#
# Every authenticated call runs the session middleware, which rewrites the caller's
# last_activity_at to now: back-date the clock again right before each run that must scan alice.

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
  fund_user_lightning "$ALICE" "$ALICE.btc_wallet_id" 10000
  create_user "$BOB"
}

teardown() {
  assert_balance_for_check
}

today_utc() {
  date -u +%Y-%m-%d
}

run_notice_job_live() {
  local out="${BATS_TEST_TMPDIR}/notice-$(date +%s%N).csv"
  buck2 run //core/api:dev-inactivity-fee-job -- notice --as-of "$(today_utc)" --live --out "$out" > .e2e-inactivity-fee-job.log
  echo "$out"
}

# mongo_cli word-splits its argument, so the command must not contain whitespace.
active_notice_count() {
  local account_id=$1
  mongo_cli "db.inactivityfeenotices.countDocuments({accountId:'${account_id}',status:'active'})"
}

live_notice_count() {
  local account_id=$1
  mongo_cli "db.inactivityfeenotices.countDocuments({accountId:'${account_id}',status:'active',bulletinIssued:true})"
}

back_date_clock_13_months() {
  local account_id=$1
  local thirteen_months_ago
  thirteen_months_ago="$(date -u -d '13 months ago' +%Y-%m-%dT%H:%M:%SZ)"
  mongo_cli "db.accounts.updateOne({id:'${account_id}'},{\$set:{last_activity_at:ISODate('${thirteen_months_ago}')}})"
}

csv_outcome_for() {
  local csv=$1
  local account_id=$2
  grep "^${account_id}," "$csv" | cut -d, -f2
}

@test "inactivity-fee-notices: globals exposes the inactivity fee amount and effective date" {
  exec_graphql 'anon' 'globals'

  cents="$(graphql_output '.data.globals.feesInformation.inactivityFee.usdCentsPerMonth')"
  [[ "${cents}" = "100" ]] || exit 1

  effective_from="$(graphql_output '.data.globals.feesInformation.inactivityFee.effectiveFrom')"
  [[ "${effective_from}" = "$(date -u -d '2026-10-15T00:00:00Z' +%s)" ]] || exit 1
}

@test "inactivity-fee-notices: a dormant funded account gets one live notice and a bulletin" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"
  back_date_clock_13_months "$account_id"

  csv="$(run_notice_job_live)"
  [[ "$(csv_outcome_for "$csv" "$account_id")" = "noticed" ]] || exit 1
  [[ "$(live_notice_count "$account_id")" -eq 1 ]] || exit 1

  # bob's clock is fresh (account creation): never scanned, no row in the report
  local bob_account_id
  bob_account_id="$(read_value "$BOB.account_id")"
  [[ -z "$(csv_outcome_for "$csv" "$bob_account_id")" ]] || exit 1
  [[ "$(active_notice_count "$bob_account_id")" -eq 0 ]] || exit 1

  local title
  for i in {1..15}; do
    exec_graphql "$ALICE" 'list-unacknowledged-stateful-notifications-with-bulletin-enabled'
    title=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].title')
    [[ "$title" = "Inactivity fee notice" ]] && break
    sleep 1
  done
  [[ "$title" = "Inactivity fee notice" ]] || exit 1

  body=$(graphql_output '.data.me.unacknowledgedStatefulNotificationsWithBulletinEnabled.nodes[0].body')
  [[ "$body" == "Inactivity fee: from "* ]] || exit 1

  # the bulletin poll above refreshed alice's clock; today's issuedAt is still newer than the
  # back-dated value, so a second run the same day finds the live row and writes nothing
  back_date_clock_13_months "$account_id"
  csv="$(run_notice_job_live)"
  [[ "$(csv_outcome_for "$csv" "$account_id")" = "already_noticed" ]] || exit 1
  [[ "$(active_notice_count "$account_id")" -eq 1 ]] || exit 1
}

@test "inactivity-fee-notices: a stale active row is superseded and a fresh one inserted" {
  local account_id
  account_id="$(read_value "$ALICE.account_id")"

  # older than the 13-month-old clock: isNoticeLive rejects it
  local fourteen_months_ago
  fourteen_months_ago="$(date -u -d '14 months ago' +%Y-%m-%dT%H:%M:%SZ)"
  mongo_cli "db.inactivityfeenotices.updateOne({accountId:'${account_id}',status:'active'},{\$set:{issuedAt:ISODate('${fourteen_months_ago}')}})"
  back_date_clock_13_months "$account_id"

  csv="$(run_notice_job_live)"
  [[ "$(csv_outcome_for "$csv" "$account_id")" = "noticed" ]] || exit 1

  superseded="$(mongo_cli "db.inactivityfeenotices.countDocuments({accountId:'${account_id}',status:'superseded',supersededReason:'stale'})")"
  [[ "$superseded" -eq 1 ]] || exit 1
  [[ "$(active_notice_count "$account_id")" -eq 1 ]] || exit 1
  [[ "$(live_notice_count "$account_id")" -eq 1 ]] || exit 1
}

@test "inactivity-fee-notices: a dormant account with no balance is skipped" {
  local account_id
  account_id="$(read_value "$BOB.account_id")"
  back_date_clock_13_months "$account_id"

  csv="$(run_notice_job_live)"
  [[ "$(csv_outcome_for "$csv" "$account_id")" = "skipped" ]] || exit 1
  [[ "$(grep "^${account_id}," "$csv" | cut -d, -f3)" = "zero_balance" ]] || exit 1
  [[ "$(active_notice_count "$account_id")" -eq 0 ]] || exit 1
}
