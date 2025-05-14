load "../../helpers/user.bash"

ALICE="alice"
BOB="bob"

setup_file() {
  clear_cache
  create_user "$ALICE"
  user_update_username "$ALICE"
  create_user "$BOB"
  user_update_username "$BOB"
}

@test "contact: add intraledger contact and verify" {
  local identifier="$(read_value "$BOB.username")"
  local alias="Intraledger Username"

  variables=$(jq -n \
    --arg identifier "$identifier" \
    --arg type "INTRALEDGER" \
    --arg alias "$alias" \
    '{input: {identifier: $identifier, type: $type, alias: $alias}}'
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

  contact_alias="$(graphql_output '.data.contactCreate.contact.alias')"
  [[ "$contact_alias" == "$alias" ]] || fail "Expected identifier to be $alias"

  # Validate contains the contact
  run is_contact "$ALICE" "$BOB"
  [[ "$status" == 0 ]] || fail "Contact not found"
}

@test "contact: add lnaddress contact and verify" {
  local identifier="lnaddress@example.com"
  local alias="ln contact alias"

  variables=$(jq -n \
    --arg identifier "$identifier" \
    --arg type "LNADDRESS" \
    --arg alias "$alias" \
    '{input: {identifier: $identifier, type: $type, alias: $alias}}'
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

  contact_alias="$(graphql_output '.data.contactCreate.contact.alias')"
  [[ "$contact_alias" == "$alias" ]] || fail "Expected type to be $alias"

  # Verify contact is persisted
  run is_contact "$ALICE" "$identifier"
  [[ "$status" == "0" ]] || fail "Contact not found"
}
