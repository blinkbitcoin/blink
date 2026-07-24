#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/intraledger.bash"
load "../../helpers/onchain.bash"
load "../../helpers/user.bash"

ALICE='alice'
BOB='bob'

setup_file() {
  clear_cache
  create_user "$ALICE"
  fund_user_onchain "$ALICE" 'btc_wallet'
  create_user "$BOB"
  fund_wallet_intraledger "$ALICE" "$ALICE.btc_wallet_id" "$BOB.btc_wallet_id" '1000'
}

fetch_csv() {
  local token_name=$1

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value "$token_name.btc_wallet_id")" \
    '{walletIds: [$wallet_id]}'
  )
  exec_graphql "$token_name" 'csv-transactions' "$variables"

  local csv_b64
  csv_b64="$(graphql_output '.data.me.defaultAccount.csvTransactions')"
  [[ -n "$csv_b64" && "$csv_b64" != "null" ]]

  echo "$csv_b64" | base64 -d
}

@test "csv-transactions: fee column is populated for all exported transactions" {
  csv="$(fetch_csv "$ALICE")"

  # "fee" is column 6 (id,walletId,type,credit,debit,fee,...); all preceding
  # columns are comma-free so splitting on "," is safe for these assertions
  header_fee="$(echo "$csv" | head -n1 | cut -d',' -f6)"
  [[ "$header_fee" == "fee" ]]

  row_count="$(echo "$csv" | tail -n +2 | grep -c . || true)"
  [[ "$row_count" -ge 2 ]]

  non_numeric_fees="$(echo "$csv" | tail -n +2 | grep . | cut -d',' -f6 | grep -cv '^[0-9][0-9]*$' || true)"
  [[ "$non_numeric_fees" -eq 0 ]]
}

@test "csv-transactions: intraledger transaction exports zero fee, not empty" {
  csv="$(fetch_csv "$ALICE")"

  on_us_fee="$(echo "$csv" | awk -F',' '$3 == "on_us" { print $6; exit }')"
  [[ "$on_us_fee" == "0" ]]
}
