#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/onchain.bash"
load "../../helpers/transactions-grpc-stream.bash"
load "../../helpers/user.bash"

ALICE='alice'

setup_file() {
  clear_cache
  create_user "$ALICE"
}

create_settled_onchain_receive_and_get_transaction_id() {
  local token_name=$1
  local wallet_id_name="$token_name.btc_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $wallet_id_name)" \
    '{input: {walletId: $wallet_id}}'
  )
  exec_graphql "$token_name" 'on-chain-address-create' "$variables" >&2
  address="$(graphql_output '.data.onChainAddressCreate.address')"
  [[ "${address}" != "null" ]] || exit 1

  bitcoin_cli sendtoaddress "$address" "0.001" >&2
  bitcoin_cli -generate 2 >&2
  retry 30 1 check_for_onchain_initiated_settled "$token_name" "$address" >&2

  exec_graphql "$token_name" 'transactions' '{"first": 20}' >&2
  transaction_id="$(get_from_transaction_by_address "$address" '.id')"
  [[ -n "${transaction_id}" ]] || exit 1
  [[ "${transaction_id}" != "null" ]] || exit 1

  echo "$transaction_id"
}

@test "transactions-grpc-stream: invalid cursor returns invalid argument" {
  transactions_grpc_stream_request '{"after_transaction_id":"not-an-object-id"}'

  [[ "$status" -ne 0 ]] || exit 1
  echo "$output" | grep -F "InvalidArgument" || exit 1
  echo "$output" | grep -F "after_transaction_id must be a valid Mongo ObjectId" || exit 1
}

@test "transactions-grpc-stream: empty cursor returns invalid argument" {
  transactions_grpc_stream_request '{"after_transaction_id":""}'

  [[ "$status" -ne 0 ]] || exit 1
  echo "$output" | grep -F "InvalidArgument" || exit 1
  echo "$output" | grep -F "after_transaction_id must be a valid Mongo ObjectId" || exit 1
}

@test "transactions-grpc-stream: replays transactions after cursor" {
  first_transaction_id="$(create_settled_onchain_receive_and_get_transaction_id "$ALICE")"
  second_transaction_id="$(create_settled_onchain_receive_and_get_transaction_id "$ALICE")"

  data=$(
    jq -n \
    --arg after_transaction_id "$first_transaction_id" \
    '{after_transaction_id: $after_transaction_id}'
  )
  transactions_grpc_stream_request "$data" -max-time 3

  echo "$output" | grep -F "\"ledgerTransactionId\": \"$second_transaction_id\"" || exit 1
  echo "$output" | grep -F "\"walletId\": \"$(read_value "$ALICE.btc_wallet_id")\"" || exit 1
  echo "$output" | grep -F "\"accountId\": \"$(read_value "$ALICE.account_id")\"" || exit 1
}
