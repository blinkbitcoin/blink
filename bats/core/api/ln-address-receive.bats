#!/usr/bin/env bats

load "../../helpers/_common.bash"
load "../../helpers/cli.bash"
load "../../helpers/ledger.bash"
load "../../helpers/ln.bash"
load "../../helpers/user.bash"
load "../../helpers/wallet.bash"

ALICE='alice_ln_address'

setup_file() {
  clear_cache

  create_user "$ALICE"
  user_update_username "$ALICE"
}

@test "ln-address-receive: accountIdentifier resolves an existing Blink username" {
  local username="$(read_value $ALICE.username)"

  variables=$(
    jq -n \
    --arg username "$username" \
    '{username: $username}'
  )
  exec_graphql 'anon' 'account-identifier' "$variables"

  exists="$(graphql_output '.data.accountIdentifier.exists')"
  provider="$(graphql_output '.data.accountIdentifier.provider')"
  [[ "$exists" == "true" ]] || exit 1
  [[ "$provider" == "BLINK" ]] || exit 1
}

@test "ln-address-receive: accountIdentifier reports a non-existent username" {
  variables='{"username": "idontexist12345"}'
  exec_graphql 'anon' 'account-identifier' "$variables"

  exists="$(graphql_output '.data.accountIdentifier.exists')"
  provider="$(graphql_output '.data.accountIdentifier.provider')"
  [[ "$exists" == "false" ]] || exit 1
  [[ "$provider" == "null" ]] || exit 1
}

@test "ln-address-receive: rejects a lightning address on a non-configured domain" {
  variables=$(
    jq -n \
    --arg amount 200 \
    '{input: {lnAddress: "attacker@evil.example", amount: $amount}}'
  )
  exec_graphql "$ALICE" 'ln-address-invoice-create' "$variables"

  error_msg="$(graphql_output '.data.lnAddressInvoiceCreate.errors[0].message')"
  [[ "$error_msg" == *"lightning addresses are supported"* ]] || exit 1
}

@test "ln-address-receive: create invoice for a Blink lightning address and confirm settlement" {
  local username="$(read_value $ALICE.username)"
  local ln_address="${username}@${LNURL_SERVER_LN_ADDRESS_DOMAIN:-localhost:4088}"
  local amount=200

  # Create the invoice via the LNURL-pay delegation flow
  variables=$(
    jq -n \
    --arg ln_address "$ln_address" \
    --arg amount "$amount" \
    '{input: {lnAddress: $ln_address, amount: $amount}}'
  )
  exec_graphql "$ALICE" 'ln-address-invoice-create' "$variables"

  payment_request="$(graphql_output '.data.lnAddressInvoiceCreate.invoice.paymentRequest')"
  payment_hash="$(graphql_output '.data.lnAddressInvoiceCreate.invoice.paymentHash')"
  verify="$(graphql_output '.data.lnAddressInvoiceCreate.invoice.verify')"
  [[ "$payment_request" != "null" ]] || exit 1
  [[ "$payment_hash" != "null" ]] || exit 1
  [[ "$verify" != "null" ]] || exit 1

  # Status is unsettled before payment
  variables=$(
    jq -n \
    --arg payment_hash "$payment_hash" \
    '{input: {paymentHash: $payment_hash}}'
  )
  exec_graphql 'anon' 'ln-address-invoice-payment-status' "$variables"
  settled="$(graphql_output '.data.lnAddressInvoicePaymentStatus.settled')"
  [[ "$settled" == "false" ]] || exit 1

  # Pay the invoice from the outside node
  lnd_outside_cli payinvoice -f --pay_req "$payment_request"

  # Status becomes settled after payment
  variables=$(
    jq -n \
    --arg payment_hash "$payment_hash" \
    '{input: {paymentHash: $payment_hash}}'
  )
  retry 15 1 check_ln_address_invoice_settled "$payment_hash"
}

check_ln_address_invoice_settled() {
  local payment_hash=$1
  local variables=$(
    jq -n \
    --arg payment_hash "$payment_hash" \
    '{input: {paymentHash: $payment_hash}}'
  )
  exec_graphql 'anon' 'ln-address-invoice-payment-status' "$variables"
  local settled="$(graphql_output '.data.lnAddressInvoicePaymentStatus.settled')"
  [[ "$settled" == "true" ]] || return 1
}
