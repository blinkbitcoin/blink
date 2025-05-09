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

<<<<<<< HEAD
@test "contact: add intraledger contact" {
  local handle="$(read_value "$BOB.username")"
  local displayName="Intraledger Username"

  variables=$(jq -n \
    --arg handle "$handle" \
    --arg type "INTRALEDGER" \
    --arg displayName "$displayName" \
    '{input: {handle: $handle, type: $type, displayName: $displayName}}'
=======
@test "contact: add intraledger contact and verify" {
  local identifier="$(read_value "$BOB.username")"
  local alias="Intraledger Username"

  variables=$(jq -n \
    --arg identifier "$identifier" \
    --arg type "INTRALEDGER" \
    --arg alias "$alias" \
    '{input: {identifier: $identifier, type: $type, alias: $alias}}'
>>>>>>> 350269fcf (chore: renamin contact with upsert references)
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

<<<<<<< HEAD
  contact_display_name="$(graphql_output '.data.contactCreate.contact.displayName')"
  [[ "$contact_display_name" == "$displayName" ]] || fail "Expected handle to be $displayName"
=======
  contact_alias="$(graphql_output '.data.contactCreate.contact.alias')"
  [[ "$contact_alias" == "$alias" ]] || fail "Expected identifier to be $alias"
>>>>>>> 350269fcf (chore: renamin contact with upsert references)

  # Validate contains the contact
  run is_contact "$ALICE" "$BOB"
  [[ "$status" == 0 ]] || fail "Contact not found"
}

<<<<<<< HEAD
@test "contact: add lnaddress contact" {
  local handle="lnaddress@example.com"
  local displayName="ln contact displayName"

  variables=$(jq -n \
    --arg handle "$handle" \
    --arg type "LNADDRESS" \
    --arg displayName "$displayName" \
    '{input: {handle: $handle, type: $type, displayName: $displayName}}'
=======
@test "contact: add lnaddress contact and verify" {
  local identifier="lnaddress@example.com"
  local alias="ln contact alias"

  variables=$(jq -n \
    --arg identifier "$identifier" \
    --arg type "LNADDRESS" \
    --arg alias "$alias" \
    '{input: {identifier: $identifier, type: $type, alias: $alias}}'
>>>>>>> 350269fcf (chore: renamin contact with upsert references)
  )

  # Call GraphQL mutation
  exec_graphql "$ALICE" "contact-create" "$variables"

  # Validate GraphQL response
  contact_id="$(graphql_output '.data.contactCreate.contact.id')"
  [[ -n "$contact_id" ]] || fail "Expected contact to be created"

<<<<<<< HEAD
  contact_display_name="$(graphql_output '.data.contactCreate.contact.displayName')"
  [[ "$contact_display_name" == "$displayName" ]] || fail "Expected type to be $displayName"

  # Verify contact is persisted
  run is_contact "$ALICE" "$handle"
=======
  contact_alias="$(graphql_output '.data.contactCreate.contact.alias')"
  [[ "$contact_alias" == "$alias" ]] || fail "Expected type to be $alias"

  # Verify contact is persisted
  run is_contact "$ALICE" "$identifier"
>>>>>>> 350269fcf (chore: renamin contact with upsert references)
  [[ "$status" == "0" ]] || fail "Contact not found"
}
