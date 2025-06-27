#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"
load "../../helpers/merchant.bash"

setup_file() {
  clear_cache

  create_user 'alice'
}

teardown() {
  balance="$(balance_for_check)"
  if [[ "$balance" != 0 ]]; then
    fail "Error: balance_for_check failed ($balance)"
  fi
}

teardown_file() {
  ./dev/bin/init-lightning.sh
}

run_cron() {
  buck2 run //core/api:dev-cron > .e2e-cron.log
}

wait_for_bria_hot_balance_at_least() {
  amount=$1

  bria_settled_hot_balance=$(
    bria_cli wallet-balance -w "dev-wallet" \
    | jq -r '.effectiveSettled'
  )

  [[ "$amount" -le "$bria_settled_hot_balance" ]] || return 1
}

mempool_not_empty() {
  local txid="$(bitcoin_cli getrawmempool | jq -r ".[0]")"
  [[ "$txid" != "null" ]] || exit 1
}

no_pending_lnd1_channels() {
  pending_channel="$(lnd_cli pendingchannels | jq -r '.pending_open_channels[0]')"
  if [[ "$pending_channel" != "null" ]]; then
    bitcoin_cli -generate 6
    exit 1
  fi
}

synced_to_graph() {
  lnd_cli_value="$1"
  is_synced="$(run_with_lnd $lnd_cli_value getinfo | jq -r '.synced_to_graph')"
  [[ "$is_synced" == "true" ]] || return 1
}

@test "cron: rebalance hot to cold storage" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"

  # Create address
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    '{input: {walletId: $wallet_id}}'
  )
  exec_graphql "$token_name" 'on-chain-address-create' "$variables"
  address="$(graphql_output '.data.onChainAddressCreate.address')"

  bitcoin_cli sendtoaddress "$address" "10"
  bitcoin_cli -generate 2

  retry 15 1 wait_for_bria_hot_balance_at_least 1000000000

  local key1="tpubDEaDfeS1EXpqLVASNCW7qAHW1TFPBpk2Z39gUXjFnsfctomZ7N8iDpy6RuGwqdXAAZ5sr5kQZrxyuEn15tqPJjM4mcPSuXzV27AWRD3p9Q4"
  local key2="tpubDEPCxBfMFRNdfJaUeoTmepLJ6ZQmeTiU1Sko2sdx1R3tmPpZemRUjdAHqtmLfaVrBg1NBx2Yx3cVrsZ2FTyBuhiH9mPSL5ozkaTh1iZUTZx"

  bria_cli import-xpub -x "${key1}" -n cold-key1 -d m/48h/1h/0h/2h || true
  bria_cli import-xpub -x "${key2}" -n cold-key2 -d m/48h/1h/0h/2h || true
  bria_cli create-wallet -n cold sorted-multisig -x cold-key1 cold-key2 -t 1 || true

  cold_balance=$(bria_cli wallet-balance -w cold | jq -r '.effectivePendingIncome')

  [[ "${cold_balance}" = "0" ]] || exit 1

  run_cron

  bria_cli watch-events -o
  bitcoin_cli -generate 1
  for i in {1..30}; do
    cold_balance=$(bria_cli wallet-balance -w cold | jq -r '.effectivePendingIncome')
    [[ "${cold_balance}" != "0" ]] && break;
    sleep 1
  done
  cold_balance=$(bria_cli wallet-balance -w cold | jq -r '.effectivePendingIncome')
  [[ "${cold_balance}" != "0" ]] || exit 1;

  bitcoin_cli -generate 1

  for i in {1..20}; do
    cold_balance=$(bria_cli wallet-balance -w cold | jq -r '.effectivePendingIncome')
    [[ "${cold_balance}" = "0" ]] && break;
    sleep 1
  done
  [[ "${cold_balance}" = "0" ]] || exit 1;
}

@test "cron: rebalance internal channels" {
  # Get onchain funds into lnd1
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg amount "600000" \
    '{input: {walletId: $wallet_id, amount: $amount}}'
  )
  exec_graphql "$token_name" 'ln-invoice-create' "$variables"
  invoice="$(graphql_output '.data.lnInvoiceCreate.invoice')"

  payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  [[ "${payment_request}" != "null" ]] || exit 1
  payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  [[ "${payment_hash}" != "null" ]] || exit 1

  lnd_outside_cli payinvoice -f \
    --pay_req "$payment_request"

  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"

  close_partner_initiated_channels_with_external || true
  retry 10 1 mempool_not_empty
  bitcoin_cli -generate 3

  # Setup lnd1 -> lnd2 channel
  local local_amount="500000"
  lnd2_local_pubkey="$(lnd2_cli getinfo | jq -r '.identity_pubkey')"
  lnd_cli connect "${lnd2_local_pubkey}@${COMPOSE_PROJECT_NAME}-lnd2-1:9735" || true
  retry 10 1 synced_to_graph lnd_cli
  retry 5 1 synced_to_graph lnd2_cli
  opened=$(
    lnd_cli openchannel \
      --node_key "$lnd2_local_pubkey" \
      --local_amt "$local_amount"
  )
  funding_txid="$(echo $opened | jq -r '.funding_txid')"

  retry 10 1 mempool_not_empty
  retry 10 1 no_pending_lnd1_channels

  # Rebalance and check balances
  channel_balances=$(lnd_cli channelbalance)
  original_local_balance="$(echo $channel_balances | jq -r '.local_balance.sat')"
  original_remote_balance="$(echo $channel_balances | jq -r '.remote_balance.sat')"

  run_cron

  channel_balances=$(lnd_cli channelbalance)
  rebalanced_local_balance="$(echo $channel_balances | jq -r '.local_balance.sat')"
  rebalanced_remote_balance="$(echo $channel_balances | jq -r '.remote_balance.sat')"

  [[ "$rebalanced_local_balance" -lt "$original_local_balance" ]] || exit 1
  [[ "$rebalanced_remote_balance" -gt "$original_remote_balance" ]] || exit 1
}

@test "cron: should remove only inactive merchants" {
  exec_graphql 'anon' 'business-map-markers'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.businessMapMarkers | length')

  local new_merchant_token_name="new_merchant"
  create_new_merchant $new_merchant_token_name
  create_old_merchant "old_merchant"
  run_cron

  exec_graphql 'anon' 'business-map-markers'
  local merchants="$(graphql_output)"
  local merchants_length=$(echo "$merchants" | jq '.data.businessMapMarkers | length')
  [[ $merchants_length -eq $((initial_merchants_length + 1)) ]] || exit 1

  local username="$(read_value $new_merchant_token_name.username)"
  local merchant_username=$(echo "$merchants" | jq -r ".data.businessMapMarkers[$initial_merchants_length].username")
  [[ $merchant_username == "$username" ]] || exit 1
}

@test "cron: should not remove old merchant with recent transactions" {
  exec_graphql 'anon' 'business-map-markers'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.businessMapMarkers | length')

  local token_name="old_merchant_with_recent_tx"
  create_old_merchant $token_name
  create_tx_for_merchant $token_name
  run_cron

  exec_graphql 'anon' 'business-map-markers'
  local merchants="$(graphql_output)"
  local merchants_length=$(echo "$merchants" | jq '.data.businessMapMarkers | length')

  local username="$(read_value $token_name.username)"
  [[ $merchants_length -eq $((initial_merchants_length + 1)) ]] || exit 1
  local merchant_username=$(echo "$merchants" | jq -r ".data.businessMapMarkers[$initial_merchants_length].username")
  [[ $merchant_username == "$username" ]] || exit 1
}

@test "cron: should remove old merchant with old transactions" {
  exec_graphql 'anon' 'business-map-markers'
  local initial_merchants="$(graphql_output)"
  local initial_merchants_length=$(echo "$initial_merchants" | jq '.data.businessMapMarkers | length')

  create_old_merchant_with_old_tx "old_merchant_with_old_tx"

  run_cron

  exec_graphql 'anon' 'business-map-markers'
  local merchants="$(graphql_output)"
  local merchants_length=$(echo "$merchants" | jq '.data.businessMapMarkers | length')
  [[ $merchants_length -eq $initial_merchants_length ]] || exit 1
}
