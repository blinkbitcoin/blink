CURRENT_FILE=${BASH_SOURCE:-bats/helpers/.}
source "$(dirname "$CURRENT_FILE")/_common.bash"
source "$(dirname "$CURRENT_FILE")/cli.bash"
source "$(dirname "$CURRENT_FILE")/user.bash"
source "$(dirname "$CURRENT_FILE")/admin.bash"

create_old_merchant() {
  local token_name=$1
  create_user "$token_name"
  user_update_username "$token_name"

  local latitude=40.712776
  local longitude=-74.005974
  local title="Old Merchant"
  local username="$(read_value $token_name.username)"

  local variables=$(jq -n \
    --arg latitude "$latitude" \
    --arg longitude "$longitude" \
    --arg title "$title" \
    --arg username "$username" \
    '{input: {latitude: ($latitude | tonumber), longitude: ($longitude | tonumber), title: $title, username: $username}}'
  )

  exec_graphql "$token_name" 'merchant-map-suggest' "$variables"
  local merchant_id="$(graphql_output '.data.merchantMapSuggest.merchant.id')"
  cache_value "$token_name.merchant_id" "$merchant_id"

  login_admin
  admin_token="$(read_value 'admin.token')"
  variables=$(jq -n \
    --arg id "$merchant_id" \
    '{input: {id: $id}}'
  )
  exec_admin_graphql $admin_token 'merchant-map-validate' "$variables"

  local seven_months_ago=$(date -d "7 months ago" -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local mongo_command=$(echo "db.getCollection('merchants').updateOne(
    { username: '$username'},
    {
      \$set: {'createdAt': ISODate('$seven_months_ago')}
    });" | tr -d '[:space:]')
  mongo_cli "$mongo_command"
}

create_new_merchant() {
  local token_name=$1
  create_user "$token_name"
  user_update_username "$token_name"

  local latitude=40.712776
  local longitude=-74.005974
  local title="New Merchant"
  local username="$(read_value $token_name.username)"

  local variables=$(jq -n \
    --arg latitude "$latitude" \
    --arg longitude "$longitude" \
    --arg title "$title" \
    --arg username "$username" \
    '{input: {latitude: ($latitude | tonumber), longitude: ($longitude | tonumber), title: $title, username: $username}}'
  )

  exec_graphql "$token_name" 'merchant-map-suggest' "$variables"
  local merchant_id="$(graphql_output '.data.merchantMapSuggest.merchant.id')"
  cache_value "$token_name.merchant_id" "$merchant_id"

  login_admin
  admin_token="$(read_value 'admin.token')"
  variables=$(jq -n \
    --arg id "$merchant_id" \
    '{input: {id: $id}}'
  )
  exec_admin_graphql $admin_token 'merchant-map-validate' "$variables"
}

create_tx_for_merchant() {
  local token_name=$1
  local btc_wallet_name="$token_name.btc_wallet_id"

  local variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg amount "1000" \
    '{input: {walletId: $wallet_id, amount: $amount}}'
  )
  exec_graphql "$token_name" 'ln-invoice-create' "$variables"
  local invoice="$(graphql_output '.data.lnInvoiceCreate.invoice')"
  local payment_request="$(echo $invoice | jq -r '.paymentRequest')"
  local payment_hash="$(echo $invoice | jq -r '.paymentHash')"
  lnd_outside_cli payinvoice --json -f --pay_req "$payment_request"
  retry 15 1 check_for_ln_initiated_settled "$token_name" "$payment_hash"
  cache_value "$token_name.payment_hash" "$payment_hash"
}

create_old_merchant_with_old_tx() {
  local token_name=$1
  create_old_merchant "$token_name"

  local account_id=$(exec_graphql "$token_name" 'default-account' | graphql_output '.data.me.defaultAccount.id')
  local username="$(read_value $token_name.username)"
  local seven_months_ago=$(date -d "7 months ago" -u +"%Y-%m-%dT%H:%M:%S.%3NZ")

  create_tx_for_merchant "$token_name"
  local hash="$(read_value "$token_name.payment_hash")"

  local mongo_command=$(echo "db.getCollection('medici_transactions').updateMany({
    'hash': '$hash',
  }, {
    \$set: {
      'datetime': ISODate('$seven_months_ago'),
      'timestamp': ISODate('$seven_months_ago')
    }
  });" | tr -d '[:space:]')
  mongo_cli "$mongo_command"
}
