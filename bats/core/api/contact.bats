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

@test "contact: validate query and update" {
  local handle="lnaddress@example.com"
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
