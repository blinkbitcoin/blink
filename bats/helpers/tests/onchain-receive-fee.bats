#!/usr/bin/env bats

# Exercise the maintained test with service boundaries stubbed. This does not
# replace full-stack validation of Bria settlement or ledger accounting.
setup() {
  export FEE_FIXTURE_DIR="$BATS_TEST_TMPDIR"
  export FEE_PAYOUT_ID="8ad734e8-84e4-4e3a-b695-6d0c8cdfaecb"
  export FEE_BATCH_ID="d1f62822-7496-4eea-a94b-a7ce534fc331"
  export FEE_WALLET_ID="62f6fc64-2e22-4be2-bf75-c26b1480de7c"
  export FEE_TX_ID="1fac8073bf7ddb16e0d8595cc0b8c863706778a7cad95ec079611bca48791a61"
  export FEE_ADDRESS="bcrt1qygtrf8skej6s20nn3h4dxrur5hsmquuutydwgg"
  export FEE_ESTIMATE=282
  export FEE_ACTUAL=141
  export FEE_BRIA_BALANCE_ERROR=0
  export FEE_LND_BALANCE_ERROR=0

  # Bria's CLI serializes the Rust proto types with camelCase fields and
  # externally tagged destination enums (build.rs and proto/api/bria.proto).
  jq -n --arg id "$FEE_PAYOUT_ID" --arg batch "$FEE_BATCH_ID" \
    --arg wallet "$FEE_WALLET_ID" --arg tx "$FEE_TX_ID" --arg address "$FEE_ADDRESS" \
    '{payout: {id: $id, batchId: $batch, walletId: $wallet, txId: $tx,
      satoshis: 210000, destination: {onchainAddress: $address}}}' \
    > "$FEE_FIXTURE_DIR/payout.json"
  jq -n --arg id "$FEE_PAYOUT_ID" --arg batch "$FEE_BATCH_ID" \
    --arg wallet "$FEE_WALLET_ID" --arg tx "$FEE_TX_ID" --arg address "$FEE_ADDRESS" \
    --argjson fee "$FEE_ACTUAL" \
    '{id: $batch, txId: $tx, walletSummaries: [{walletId: $wallet, feeSats: $fee,
      payouts: [{id: $id, satoshis: 210000, destination: {onchainAddress: $address}}]}]}' \
    > "$FEE_FIXTURE_DIR/batch.json"

  local source="$BATS_TEST_DIRNAME/../../core/api/onchain-receive.bats"
  local helpers
  helpers=$(cd "$BATS_TEST_DIRNAME/.." && pwd)
  export FEE_TEST_FILE="$FEE_FIXTURE_DIR/onchain-receive.bats"
  while IFS= read -r line; do
    printf '%s\n' "${line//..\/..\/helpers/$helpers}"
  done < "$source" > "$FEE_TEST_FILE"
  # Append stubs, not a duplicate of the implementation under test.
  declare -f setup_file teardown docker sleep lnd_cli bria_cli bitcoin_cli \
    grep_in_trigger_logs >> "$FEE_TEST_FILE"
}

setup_file() { :; }
teardown() { :; }
docker() { printf 'Unexpected Docker call: %s\n' "$*" >&2; return 1; }
sleep() { :; }

lnd_cli() {
  case "$*" in
    'newaddress p2wkh') jq -n --arg address "$FEE_ADDRESS" '{address: $address}' ;;
    walletbalance)
      local balance=1000000
      if [[ -f "$FEE_FIXTURE_DIR/settled" ]]; then
        balance=$((balance + 210000 + FEE_LND_BALANCE_ERROR))
      fi
      jq -n --arg balance "$balance" '{confirmed_balance: $balance}'
      ;;
    *) printf 'Unexpected LND call: %s\n' "$*" >&2; return 1 ;;
  esac
}

bria_cli() {
  case "$*" in
    'wallet-balance -w dev-wallet')
      local balance=1000000
      if [[ -f "$FEE_FIXTURE_DIR/broadcast" ]]; then
        balance=$((balance - 210000 - FEE_ACTUAL + FEE_BRIA_BALANCE_ERROR))
      fi
      jq -n --argjson balance "$balance" '{effectiveSettled: $balance}'
      ;;
    "estimate-payout-fee -w dev-wallet -q dev-queue -d $FEE_ADDRESS -a 210000")
      jq -n --argjson fee "$FEE_ESTIMATE" '{satoshis: $fee}'
      ;;
    "submit-payout -w dev-wallet -q dev-queue -d $FEE_ADDRESS -a 210000 -m {\"galoy\":{\"rebalance\":true}}")
      jq -n --arg id "$FEE_PAYOUT_ID" '{id: $id}'
      ;;
    "get-payout -i $FEE_PAYOUT_ID") jq . "$FEE_FIXTURE_DIR/payout.json" ;;
    "get-batch -b $FEE_BATCH_ID") jq . "$FEE_FIXTURE_DIR/batch.json" ;;
    *) printf 'Unexpected Bria call: %s\n' "$*" >&2; return 1 ;;
  esac
}

bitcoin_cli() {
  case "$*" in
    '-generate 3'|'-generate 2'|'-generate 1') ;;
    *) printf 'Unexpected Bitcoin call: %s\n' "$*" >&2; return 1 ;;
  esac
}

grep_in_trigger_logs() {
  case "$1" in
    "sequence.*payout_broadcast.*$FEE_PAYOUT_ID") touch "$FEE_FIXTURE_DIR/broadcast" ;;
    "sequence.*payout_settled.*$FEE_PAYOUT_ID") touch "$FEE_FIXTURE_DIR/settled" ;;
    *) printf 'Unexpected event lookup: %s\n' "$*" >&2; return 1 ;;
  esac
}

run_fee_test() {
  rm -f "$FEE_FIXTURE_DIR/broadcast" "$FEE_FIXTURE_DIR/settled"
  run bats --formatter tap --filter '^onchain-receive: record internal onchain transfer fee$' "$FEE_TEST_FILE"
  printf '%s\n' "$output"
}

mutate_payload() {
  local file="$FEE_FIXTURE_DIR/$1.json"
  jq "$2" "$file" > "$file.next"
  mv "$file.next" "$file"
}

@test "internal onchain fee: balance uses actual fee when estimate changes" {
  run_fee_test
  [[ "$status" -eq 0 ]] || return 1
}

@test "internal onchain fee: accepts unchanged and increased actual fees" {
  for fee in 282 423; do
    setup
    export FEE_ACTUAL="$fee"
    mutate_payload batch ".walletSummaries[0].feeSats = $fee"
    run_fee_test
    [[ "$status" -eq 0 ]] || return 1
  done
}

@test "internal onchain fee: selects the matching wallet rather than the first" {
  mutate_payload batch '.walletSummaries = [{walletId: "other-wallet", feeSats: 999, payouts: []}] + .walletSummaries'
  run_fee_test
  [[ "$status" -eq 0 ]] || return 1
}

@test "internal onchain fee: rejects a mismatched payout ID" {
  mutate_payload payout '.payout.id = "unrelated-payout"'
  run_fee_test
  [[ "$status" -ne 0 ]] || return 1
  [[ "$output" == *'Invalid payout details'* ]] || return 1
}

@test "internal onchain fee: rejects a mismatched payout amount" {
  mutate_payload payout '.payout.satoshis = 210001'
  run_fee_test
  [[ "$status" -ne 0 ]] || return 1
  [[ "$output" == *'Invalid payout details'* ]] || return 1
}

@test "internal onchain fee: rejects a mismatched destination" {
  mutate_payload payout '.payout.destination.onchainAddress = "unrelated-address"'
  run_fee_test
  [[ "$status" -ne 0 ]] || return 1
  [[ "$output" == *'Invalid payout details'* ]] || return 1
}

@test "internal onchain fee: rejects missing payout identifiers" {
  for field in batchId walletId txId; do
    for value in null '""'; do
      setup
      mutate_payload payout ".payout.$field = $value"
      run_fee_test
      [[ "$status" -ne 0 ]] || return 1
      [[ "$output" == *'Invalid payout details'* ]] || return 1
    done
  done
}

@test "internal onchain fee: rejects mismatched batch details" {
  for filter in '.id = "unrelated-batch"' '.txId = "unrelated-tx"' \
    '.walletSummaries[0].walletId = "unrelated-wallet"' \
    '.walletSummaries[0].payouts[0].id = "unrelated-payout"' \
    '.walletSummaries[0].payouts[0].satoshis = 210001' \
    '.walletSummaries[0].payouts[0].destination.onchainAddress = "unrelated-address"'; do
    setup
    mutate_payload batch "$filter"
    run_fee_test
    [[ "$status" -ne 0 ]] || return 1
    [[ "$output" == *'Invalid batch fee'* ]] || return 1
  done
}

@test "internal onchain fee: rejects missing or ambiguous wallet payouts" {
  for filter in '.walletSummaries = []' \
    '.walletSummaries += .walletSummaries' \
    '.walletSummaries[0].payouts = []' \
    '.walletSummaries[0].payouts += .walletSummaries[0].payouts'; do
    setup
    mutate_payload batch "$filter"
    run_fee_test
    [[ "$status" -ne 0 ]] || return 1
    [[ "$output" == *'Invalid batch fee'* ]] || return 1
  done
}

@test "internal onchain fee: rejects missing or unusable fee values" {
  for value in null '""' '"invalid"' '"141"' false 0 -1 1.5; do
    setup
    export FEE_ACTUAL=0
    mutate_payload batch ".walletSummaries[0].feeSats = $value"
    run_fee_test
    [[ "$status" -ne 0 ]] || return 1
    [[ "$output" == *'Invalid batch fee'* ]] || return 1
  done
}

@test "internal onchain fee: still rejects an incorrect Bria balance" {
  export FEE_BRIA_BALANCE_ERROR=1
  run_fee_test
  [[ "$status" -ne 0 ]] || return 1
  [[ "$output" == *'Bria: 789860 - 789859'* ]] || return 1
}

@test "internal onchain fee: still rejects an incorrect LND balance" {
  export FEE_LND_BALANCE_ERROR=1
  run_fee_test
  [[ "$status" -ne 0 ]] || return 1
  [[ "$output" == *'Lnd: 1210001 - 1210000'* ]] || return 1
}
