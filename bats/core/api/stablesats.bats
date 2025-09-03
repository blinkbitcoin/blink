#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/user.bash"

setup_file() {
  clear_cache
  create_user 'alice'
}

@test "stablesats: can get quote for BUY_USD_WITH_SATS" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"
  sat_amount="10000"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "BUY_USD_WITH_SATS" \
    --arg sat_amount "$sat_amount" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, satAmount: ($sat_amount | tonumber)}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
  
  quote_id="$(graphql_output '.data.stableSatsGetQuote.quote.quoteId')"
  amount_to_sell_sats="$(graphql_output '.data.stableSatsGetQuote.quote.amountToSellInSats')"
  amount_to_buy_cents="$(graphql_output '.data.stableSatsGetQuote.quote.amountToBuyInCents')"
  expires_at="$(graphql_output '.data.stableSatsGetQuote.quote.expiresAt')"
  executed="$(graphql_output '.data.stableSatsGetQuote.quote.executed')"
  
  [[ -n "$quote_id" ]] || exit 1
  [[ "$amount_to_sell_sats" -gt 0 ]] || exit 1
  [[ "$amount_to_buy_cents" -gt 0 ]] || exit 1
  [[ "$expires_at" -gt 0 ]] || exit 1
  [[ "$executed" = "false" ]] || exit 1
}

@test "stablesats: can get quote for BUY_USD_WITH_CENTS" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"
  cent_amount="500"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "BUY_USD_WITH_CENTS" \
    --arg cent_amount "$cent_amount" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, centAmount: ($cent_amount | tonumber)}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
  
  quote_id="$(graphql_output '.data.stableSatsGetQuote.quote.quoteId')"
  amount_to_sell_sats="$(graphql_output '.data.stableSatsGetQuote.quote.amountToSellInSats')"
  amount_to_buy_cents="$(graphql_output '.data.stableSatsGetQuote.quote.amountToBuyInCents')"
  expires_at="$(graphql_output '.data.stableSatsGetQuote.quote.expiresAt')"
  executed="$(graphql_output '.data.stableSatsGetQuote.quote.executed')"
  
  [[ -n "$quote_id" ]] || exit 1
  [[ "$amount_to_sell_sats" -gt 0 ]] || exit 1
  [[ "$amount_to_buy_cents" = "$cent_amount" ]] || exit 1
  [[ "$expires_at" -gt 0 ]] || exit 1
  [[ "$executed" = "false" ]] || exit 1
}

@test "stablesats: can get quote for SELL_USD_FOR_SATS" {
  token_name='alice'
  usd_wallet_name="$token_name.usd_wallet_id"
  sat_amount="5000"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg quote_type "SELL_USD_FOR_SATS" \
    --arg sat_amount "$sat_amount" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, satAmount: ($sat_amount | tonumber)}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
  
  quote_id="$(graphql_output '.data.stableSatsGetQuote.quote.quoteId')"
  amount_to_buy_sats="$(graphql_output '.data.stableSatsGetQuote.quote.amountToBuyInSats')"
  amount_to_sell_cents="$(graphql_output '.data.stableSatsGetQuote.quote.amountToSellInCents')"
  expires_at="$(graphql_output '.data.stableSatsGetQuote.quote.expiresAt')"
  executed="$(graphql_output '.data.stableSatsGetQuote.quote.executed')"
  
  [[ -n "$quote_id" ]] || exit 1
  [[ "$amount_to_buy_sats" = "$sat_amount" ]] || exit 1
  [[ "$amount_to_sell_cents" -gt 0 ]] || exit 1
  [[ "$expires_at" -gt 0 ]] || exit 1
  [[ "$executed" = "false" ]] || exit 1
}

@test "stablesats: can get quote for SELL_USD_FOR_CENTS" {
  token_name='alice'
  usd_wallet_name="$token_name.usd_wallet_id"
  cent_amount="250"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg quote_type "SELL_USD_FOR_CENTS" \
    --arg cent_amount "$cent_amount" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, centAmount: ($cent_amount | tonumber)}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
  
  quote_id="$(graphql_output '.data.stableSatsGetQuote.quote.quoteId')"
  amount_to_buy_sats="$(graphql_output '.data.stableSatsGetQuote.quote.amountToBuyInSats')"
  amount_to_sell_cents="$(graphql_output '.data.stableSatsGetQuote.quote.amountToSellInCents')"
  expires_at="$(graphql_output '.data.stableSatsGetQuote.quote.expiresAt')"
  executed="$(graphql_output '.data.stableSatsGetQuote.quote.executed')"
  
  [[ -n "$quote_id" ]] || exit 1
  [[ "$amount_to_buy_sats" -gt 0 ]] || exit 1
  [[ "$amount_to_sell_cents" = "$cent_amount" ]] || exit 1
  [[ "$expires_at" -gt 0 ]] || exit 1
  [[ "$executed" = "false" ]] || exit 1
}

@test "stablesats: returns error for missing satAmount with BUY_USD_WITH_SATS" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "BUY_USD_WITH_SATS" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  error_message="$(graphql_output '.data.stableSatsGetQuote.errors[0].message')"
  [[ "$error_message" = "satAmount is required for BUY_USD_WITH_SATS" ]] || exit 1
}

@test "stablesats: returns error for missing centAmount with BUY_USD_WITH_CENTS" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "BUY_USD_WITH_CENTS" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  error_message="$(graphql_output '.data.stableSatsGetQuote.errors[0].message')"
  [[ "$error_message" = "centAmount is required for BUY_USD_WITH_CENTS" ]] || exit 1
}

@test "stablesats: returns error for invalid quote type" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "INVALID_QUOTE_TYPE" \
    --arg sat_amount "1000" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, satAmount: ($sat_amount | tonumber)}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  # GraphQL enum validation error occurs at the schema level
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  # The enum validation error is typically in the second error message
  error_message="$(graphql_output '.errors[1].message')"
  [[ "$error_message" =~ "does not exist in \"QuoteType\" enum" ]] || exit 1
}

@test "stablesats: requires authentication" {
  # Create a random wallet ID to use for unauthenticated request
  fake_wallet_id="70df854e-bb34-4c4b-91b5-1e4fdcca27fd"

  variables=$(
    jq -n \
    --arg wallet_id "$fake_wallet_id" \
    --arg quote_type "BUY_USD_WITH_SATS" \
    --arg sat_amount "1000" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, satAmount: ($sat_amount | tonumber)}}'
  )
  
  exec_graphql 'anon' 'stablesats-get-quote' "$variables"
  
  # Should get an authentication error
  errors="$(graphql_output '.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  # Check for authentication-related error message
  error_message="$(graphql_output '.errors[0].message')"
  [[ "$error_message" =~ (Not authorized|Unauthorized|Authentication|Authorization|access) ]] || exit 1
}

@test "stablesats: can request quote with immediateExecution flag" {
  token_name='alice'
  btc_wallet_name="$token_name.btc_wallet_id"
  sat_amount="2000"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $btc_wallet_name)" \
    --arg quote_type "BUY_USD_WITH_SATS" \
    --arg sat_amount "$sat_amount" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type, satAmount: ($sat_amount | tonumber), immediateExecution: true}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" = "0" ]] || exit 1
  
  quote_id="$(graphql_output '.data.stableSatsGetQuote.quote.quoteId')"
  executed="$(graphql_output '.data.stableSatsGetQuote.quote.executed')"
  
  [[ -n "$quote_id" ]] || exit 1
  # With immediateExecution, the quote might be executed immediately
  [[ "$executed" = "true" || "$executed" = "false" ]] || exit 1
}

@test "stablesats: returns error for missing required parameters in SELL quotes" {
  token_name='alice'
  usd_wallet_name="$token_name.usd_wallet_id"

  # Test SELL_USD_FOR_SATS without satAmount
  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg quote_type "SELL_USD_FOR_SATS" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  error_message="$(graphql_output '.data.stableSatsGetQuote.errors[0].message')"
  [[ "$error_message" = "satAmount is required for SELL_USD_FOR_SATS" ]] || exit 1
}

@test "stablesats: returns error for missing centAmount with SELL_USD_FOR_CENTS" {
  token_name='alice'
  usd_wallet_name="$token_name.usd_wallet_id"

  variables=$(
    jq -n \
    --arg wallet_id "$(read_value $usd_wallet_name)" \
    --arg quote_type "SELL_USD_FOR_CENTS" \
    '{input: {walletId: $wallet_id, quoteType: $quote_type}}'
  )
  
  exec_graphql "$token_name" 'stablesats-get-quote' "$variables"
  
  errors="$(graphql_output '.data.stableSatsGetQuote.errors | length')"
  [[ "${errors}" -gt "0" ]] || exit 1
  
  error_message="$(graphql_output '.data.stableSatsGetQuote.errors[0].message')"
  [[ "$error_message" = "centAmount is required for SELL_USD_FOR_CENTS" ]] || exit 1
}