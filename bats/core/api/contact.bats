load "../../helpers/intraledger.bash"
load "../../helpers/onchain.bash"
load "../../helpers/user.bash"

ALICE="alice"
BOB="bob"
LNADDRESS_CONTACT="lnaddress@example.com"

setup_file() {
  clear_cache
  create_user "$ALICE"
  user_update_username "$ALICE"
  create_user "$BOB"
  user_update_username "$BOB"
}

@test "contact: add intraledger contact" {
  local handle="$(read_value "$BOB.username")"
  local displayName="Intraledger Username"

  variables=$(jq -n \
    --arg handle "$handle" \
    --arg type "INTRALEDGER" \
    --arg displayName "$displayName" \
    '{input: {handle: $handle, type: $type, displayName: $displayName}}'
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

  contact_display_name="$(graphql_output '.data.contactCreate.contact.displayName')"
  [[ "$contact_display_name" == "$displayName" ]] || fail "Expected handle to be $displayName"

  # Validate contains the contact
  run is_contact "$ALICE" "$BOB"
  [[ "$status" == 0 ]] || fail "Contact not found"
}

@test "contact: add lnaddress contact" {
  local handle="$LNADDRESS_CONTACT"
  local displayName="ln contact displayName"

  variables=$(jq -n \
    --arg handle "$handle" \
    --arg type "LNADDRESS" \
    --arg displayName "$displayName" \
    '{input: {handle: $handle, type: $type, displayName: $displayName}}'
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

  contact_display_name="$(graphql_output '.data.contactCreate.contact.displayName')"
  [[ "$contact_display_name" == "$displayName" ]] || fail "Expected type to be $displayName"

  # Verify contact is persisted
  run is_contact "$ALICE" "$handle"
  [[ "$status" == "0" ]] || fail "Contact not found"
}

@test "contact: fetch an intraledger contact by handle with its transactions" {
  fund_user_onchain "$ALICE" 'btc_wallet'
  fund_wallet_intraledger "$ALICE" "$ALICE.btc_wallet_id" "$BOB.btc_wallet_id" '1000'

  local handle="$(read_value "$BOB.username")"

  variables=$(jq -n --arg handle "$handle" '{handle: $handle}')
  exec_graphql "$ALICE" 'contact-by-handle' "$variables"

  [[ "$(graphql_output '.data.me.contactByHandle.handle')" == "$handle" ]] \
    || fail "Expected contact $handle"
  [[ "$(graphql_output '.data.me.contactByHandle.transactions.edges | length')" -gt 0 ]] \
    || fail "Expected transactions for contact $handle"
}

@test "contact: fetch an intraledger contact by handle regardless of case and spacing" {
  local handle="$(read_value "$BOB.username")"
  local padded_handle="  $(echo "$handle" | tr '[:lower:]' '[:upper:]')  "

  variables=$(jq -n --arg handle "$padded_handle" '{handle: $handle}')
  exec_graphql "$ALICE" 'contact-by-handle' "$variables"

  [[ "$(graphql_output '.data.me.contactByHandle.handle')" == "$handle" ]] \
    || fail "Expected contact $handle"
}

@test "contact: fetch an lnaddress contact by handle" {
  variables=$(jq -n --arg handle "$LNADDRESS_CONTACT" '{handle: $handle}')
  exec_graphql "$ALICE" 'contact-by-handle' "$variables"

  [[ "$(graphql_output '.errors')" == "null" ]] \
    || fail "Expected no error for contact $LNADDRESS_CONTACT"
  [[ "$(graphql_output '.data.me.contactByHandle.handle')" == "$LNADDRESS_CONTACT" ]] \
    || fail "Expected contact $LNADDRESS_CONTACT"
  [[ "$(graphql_output '.data.me.contactByHandle.transactions.edges | length')" == "0" ]] \
    || fail "Expected no transaction for a contact hosted elsewhere"
}

@test "contact: fetch an unknown handle" {
  variables=$(jq -n --arg handle "unknown@example.com" '{handle: $handle}')
  exec_graphql "$ALICE" 'contact-by-handle' "$variables"

  [[ "$(graphql_output '.errors[0].message')" == *"NoContactForHandleError"* ]] \
    || fail "Expected NoContactForHandleError"
}

@test "contact: fetch a malformed handle" {
  variables=$(jq -n --arg handle "not a handle!" '{handle: $handle}')
  exec_graphql "$ALICE" 'contact-by-handle' "$variables"

  [[ "$(graphql_output '.errors[0].message')" == "Invalid value for Handle" ]] \
    || fail "Expected the handle scalar to reject the value"
}

@test "contact: fetch an intraledger contact by username" {
  local username="$(read_value "$BOB.username")"

  variables=$(jq -n --arg username "$username" '{username: $username}')
  exec_graphql "$ALICE" 'contact-by-username' "$variables"

  [[ "$(graphql_output '.data.me.contactByUsername.handle')" == "$username" ]] \
    || fail "Expected contact $username"
  [[ "$(graphql_output '.data.me.contactByUsername.transactions.edges | length')" -gt 0 ]] \
    || fail "Expected transactions for contact $username"
}

@test "contact: fetch an lnaddress contact by username" {
  variables=$(jq -n --arg username "$LNADDRESS_CONTACT" '{username: $username}')
  exec_graphql "$ALICE" 'contact-by-username' "$variables"

  [[ "$(graphql_output '.errors[0].message')" == "Invalid value for Username" ]] \
    || fail "Expected the username scalar to keep rejecting lnaddress handles"
}
