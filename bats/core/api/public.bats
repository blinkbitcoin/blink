#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/subscriber.bash"

teardown() {
  stop_subscriber
}

@test "public: can query globals" {
  exec_graphql 'anon' 'globals'
  network="$(graphql_output '.data.globals.network')"
  [[ "${network}" = "regtest" ]] || exit 1

  block_height="$(graphql_output '.data.globals.blockInfo.blockHeight')"
  block_hash="$(graphql_output '.data.globals.blockInfo.blockHash')"
  [[ -n "${block_height}" ]] || exit 1
  [[ "${block_height}" != "null" ]] || exit 1
  [[ -n "${block_hash}" ]] || exit 1
  [[ "${block_hash}" != "null" ]] || exit 1
}

@test "public: globals exposes the onchain deposit fee tiers" {
  exec_graphql 'anon' 'globals'

  min_bank_fee="$(graphql_output '.data.globals.feesInformation.deposit.minBankFee')"
  [[ "${min_bank_fee}" = "2500" ]] || exit 1

  threshold="$(graphql_output '.data.globals.feesInformation.deposit.minBankFeeThreshold')"
  [[ "${threshold}" = "1000000" ]] || exit 1

  tiers_count="$(graphql_output '.data.globals.feesInformation.deposit.tiers | length')"
  [[ "${tiers_count}" = "2" ]] || exit 1

  first_tier_max="$(graphql_output '.data.globals.feesInformation.deposit.tiers[0].maxAmount')"
  first_tier_amount="$(graphql_output '.data.globals.feesInformation.deposit.tiers[0].amount')"
  [[ "${first_tier_max}" = "1000000" ]] || exit 1
  [[ "${first_tier_amount}" = "2500" ]] || exit 1

  last_tier_max="$(graphql_output '.data.globals.feesInformation.deposit.tiers[1].maxAmount')"
  last_tier_amount="$(graphql_output '.data.globals.feesInformation.deposit.tiers[1].amount')"
  [[ "${last_tier_max}" = "null" ]] || exit 1
  [[ "${last_tier_amount}" = "0" ]] || exit 1
}

@test "public: globals exposes daily limits for every account level" {
  exec_graphql 'anon' 'globals'

  levels_count="$(graphql_output '.data.globals.accountLimitsByLevel | length')"
  [[ "${levels_count}" = "4" ]] || exit 1

  level_one="$(graphql_output '.data.globals.accountLimitsByLevel[] | select(.level == "ONE")')"
  [[ -n "${level_one}" ]] || exit 1

  interval="$(echo "${level_one}" | jq -r '.interval')"
  withdrawal="$(echo "${level_one}" | jq -r '.withdrawal')"
  internal_send="$(echo "${level_one}" | jq -r '.internalSend')"
  convert="$(echo "${level_one}" | jq -r '.convert')"
  [[ "${interval}" = "86400" ]] || exit 1
  [[ "${withdrawal}" = "100000" ]] || exit 1
  [[ "${internal_send}" = "200000" ]] || exit 1
  [[ "${convert}" = "5000000" ]] || exit 1
}

@test "public: can query realtime price" {
  currency="EUR"
  variables=$(
    jq -n \
    --arg currency "$currency" \
    '{currency: $currency}'
  )
  exec_graphql 'anon' 'real-time-price' "$variables"

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1

  currency_id="$(graphql_output '.data.realtimePrice.denominatorCurrencyDetails.id')"
  currency_frac_digits="$(graphql_output '.data.realtimePrice.denominatorCurrencyDetails.fractionDigits')"
  denominatorCurrency="$(graphql_output '.data.realtimePrice.denominatorCurrency')"
  sat_price_base="$(graphql_output '.data.realtimePrice.btcSatPrice.base')"
  sat_price_offset="$(graphql_output '.data.realtimePrice.btcSatPrice.offset')"
  cents_price_base="$(graphql_output '.data.realtimePrice.usdCentPrice.base')"
  cents_price_offset="$(graphql_output '.data.realtimePrice.usdCentPrice.offset')"
  [[ "${currency_id}" = "${currency}" ]] || exit 1
  [[ "${currency_frac_digits}" = 2 ]] || exit 1
  [[ "${denominatorCurrency}" = "${currency}" ]] || exit 1
  [[ "$sat_price_base" -gt 0 ]] || exit 1
  [[ "$sat_price_offset" = 12 ]] || exit 1
  [[ "$cents_price_base" -gt 0 ]] || exit 1
  [[ "$cents_price_offset" = 6 ]] || exit 1
}

@test "public: realtime price honors price-service fraction digits" {
  currency="PKR"
  variables=$(
    jq -n \
    --arg currency "$currency" \
    '{currency: $currency}'
  )
  exec_graphql 'anon' 'real-time-price' "$variables"

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1

  currency_frac_digits="$(graphql_output '.data.realtimePrice.denominatorCurrencyDetails.fractionDigits')"
  sat_price_base="$(graphql_output '.data.realtimePrice.btcSatPrice.base')"
  sat_price_offset="$(graphql_output '.data.realtimePrice.btcSatPrice.offset')"
  cents_price_base="$(graphql_output '.data.realtimePrice.usdCentPrice.base')"
  cents_price_offset="$(graphql_output '.data.realtimePrice.usdCentPrice.offset')"
  [[ "${currency_frac_digits}" = 2 ]] || exit 1
  [[ "${sat_price_base}" = 5600000000000 ]] || exit 1
  [[ "${sat_price_offset}" = 12 ]] || exit 1
  [[ "${cents_price_base}" = 280000000 ]] || exit 1
  [[ "${cents_price_offset}" = 6 ]] || exit 1
}

@test "public: realtime price supports zero price-service fraction digits" {
  currency="XTS"
  variables=$(
    jq -n \
      --arg currency "$currency" \
      '{currency: $currency}'
  )
  exec_graphql 'anon' 'real-time-price' "$variables"

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1

  currency_frac_digits="$(graphql_output '.data.realtimePrice.denominatorCurrencyDetails.fractionDigits')"
  sat_price_base="$(graphql_output '.data.realtimePrice.btcSatPrice.base')"
  cents_price_base="$(graphql_output '.data.realtimePrice.usdCentPrice.base')"
  [[ "${currency_frac_digits}" = 0 ]] || exit 1
  [[ "${sat_price_base}" = 20000000000 ]] || exit 1
  [[ "${cents_price_base}" = 1000000 ]] || exit 1
}

@test "public: currency list exposes every configured quote" {
  exec_graphql 'anon' 'currency-list'

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1

  currencies="$(graphql_output '.data.currencyList | sort_by(.id)')"
  expected='[{"id":"EUR","fractionDigits":2},{"id":"PKR","fractionDigits":2},{"id":"USD","fractionDigits":2},{"id":"XTS","fractionDigits":0}]'
  [[ "$(echo "${currencies}" | jq -c '[.[] | {id, fractionDigits}]')" = "${expected}" ]] || exit 1
}

@test "public: can apply idempotency key to queries" {
  fixed_idempotency_key=$(new_idempotency_key)
  original_new_idempotency_key=$(declare -f new_idempotency_key)
  new_idempotency_key() {
    echo $fixed_idempotency_key
  }

  # Successful 1st attempt
  exec_graphql 'anon' 'globals'
  errors="$(graphql_output '.errors')"
  [[ "$errors" == "null" ]] || exit 1

  # Failed 2nd attempt with same idempotency key
  exec_graphql 'anon' 'globals'
  error_msg="$(graphql_output '.errors[0].message')"
  [[ "$error_msg" == "HTTP fetch failed from 'public': 409: Conflict" ]] || exit 1

  # Failed attempt with invalid idempotency key
  new_idempotency_key() {
    echo "invalid-key"
  }
  exec_graphql 'anon' 'globals'
  error_msg="$(graphql_output '.errors[0].message')"
  [[ "$error_msg" == "HTTP fetch failed from 'public': 400: Bad Request" ]] || exit 1

  # Successful 3rd attempt with unique valid idempotency key
  eval "$original_new_idempotency_key"
  exec_graphql 'anon' 'globals'
  [[ "$errors" == "null" ]] || exit 1
}

@test "public: can subscribe to price" {
  subscribe_to 'anon' price-sub
  retry 10 1 grep 'Data.*\bprice\b' "${SUBSCRIBER_LOG_FILE}"

  num_errors=$(
    grep 'Data.*\bprice\b' "${SUBSCRIBER_LOG_FILE}" \
      | awk '{print $2}' \
      | jq -s -r 'map(.data.price.errors | length) | add'
  )
  [[ "$num_errors" == "0" ]] || exit 1
}

@test "public: can subscribe to realtime price" {
  subscribe_to 'anon' real-time-price-sub '{"currency": "EUR"}'
  retry 10 1 grep 'Data.*\brealtimePrice\b.*EUR' "${SUBSCRIBER_LOG_FILE}"

  num_errors=$(
    grep 'Data.*\brealtimePrice\b.*EUR' "${SUBSCRIBER_LOG_FILE}" \
      | awk '{print $2}' \
      | jq -s -r 'map(.data.realtimePrice.errors | length) | add'
  )
  [[ "$num_errors" == "0" ]] || exit 1
}

@test "public: realtime price subscription honors price-service fraction digits" {
  subscribe_to 'anon' real-time-price-sub '{"currency": "PKR"}'
  retry 10 1 grep 'Data.*\brealtimePrice\b.*PKR' "${SUBSCRIBER_LOG_FILE}"

  subscription_events=$(
    grep 'Data.*\brealtimePrice\b.*PKR' "${SUBSCRIBER_LOG_FILE}" \
      | sed 's/^Data: //' \
      | jq -s -c '.'
  )
  realtime_price="$(echo "$subscription_events" | jq -c 'map(.data.realtimePrice.realtimePrice) | last')"
  num_errors="$(echo "$subscription_events" | jq -r 'map(.data.realtimePrice.errors | length) | add')"

  [[ "$num_errors" == "0" ]] || exit 1
  [[ "$(echo "$realtime_price" | jq -r '.denominatorCurrencyDetails.fractionDigits')" = 2 ]] || exit 1
  [[ "$(echo "$realtime_price" | jq -r '.btcSatPrice.base')" = 5600000000000 ]] || exit 1
  [[ "$(echo "$realtime_price" | jq -r '.btcSatPrice.offset')" = 12 ]] || exit 1
  [[ "$(echo "$realtime_price" | jq -r '.usdCentPrice.base')" = 280000000 ]] || exit 1
  [[ "$(echo "$realtime_price" | jq -r '.usdCentPrice.offset')" = 6 ]] || exit 1
}

@test "public: can query currency conversion estimation" {
  fiat_amount=1.75
  currency="EUR"
  variables=$(
    jq -n \
    --arg amount "$fiat_amount" \
    --arg currency "$currency" \
    '{amount: ($amount | tonumber), currency: $currency}'
  )
  exec_graphql 'anon' 'currency-conversion-estimation' "$variables"

  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1

  sat_amount="$(graphql_output '.data.currencyConversionEstimation.btcSatAmount')"
  cents_amount="$(graphql_output '.data.currencyConversionEstimation.usdCentAmount')"
  [[ "$sat_amount" -gt 0 ]] || exit 1
  [[ "$cents_amount" -gt 0 ]] || exit 1
}
