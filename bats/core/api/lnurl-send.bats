#!/usr/bin/env bats

load "../../helpers/cli.bash"
load "../../helpers/user.bash"
load "../../helpers/onchain.bash"
load "../../helpers/wallet.bash"
load "../../helpers/ledger.bash"

setup_file() {\
  create_user 'bob'
  user_update_username 'bob'
  fund_user_onchain 'bob' 'btc_wallet'
  ensure_username_is_present "xyz_zap_receiver"
}

@test "lnurl-send: rejects a direct private HTTP destination" {
  local lnurl="lnurl1dp68gup69uhkcmmrv9kxsmmnwsarxvpsxghjuam9d3kz66mwdamkutmvde6hymrs9au8j7jl0fshqhmjv43k26tkv4eq5ndl2y"
  local variables
  variables=$(jq -n \
    --arg wallet_id "$(read_value bob.btc_wallet_id)" \
    --arg lnurl "$lnurl" \
    '{input: {walletId: $wallet_id, amount: 200, lnurl: $lnurl}}')
  exec_graphql 'bob' 'lnurl-payment-send' "$variables"
  [[ "$(graphql_output '.data.lnurlPaymentSend.status')" == "FAILURE" ]]
  [[ "$(graphql_output '.data.lnurlPaymentSend.errors[0].code')" == "LNURL_REQUEST_INVOICE_ERROR" ]]
  [[ "$(graphql_output '.data.lnurlPaymentSend.errors[0].message')" == "LNURL service unreachable or not allowed" ]]
}

@test "lnurl-send: send to lnurl" {
  btc_wallet_name="bob.btc_wallet_id"

  lnurl="lnurl1dp68gurn8ghj7mrww4excttxd9u8gatjv5hx27rpd4cxcef09emk2mrv944kummhdchkcmn4wfk8qtmc09a977npwp0hyetrv45hvetjps734l" # https://lnurl-fixture.example/.well-known/lnurlp/xyz_zap_receiver

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg amount 200 \
    --arg lnurl $lnurl \
    '{input: {walletId: $wallet_id, amount: $amount, lnurl: $lnurl }}'
  )
  exec_graphql 'bob' 'lnurl-payment-send' "$variables"
  lnurl_payment_send_status="$(graphql_output '.data.lnurlPaymentSend.status')"
  [[ "${lnurl_payment_send_status}" == "SUCCESS" ]] || exit 1
}
