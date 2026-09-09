import { checkedToLightningAddress, checkedToUsername } from "../accounts"

import {
  InvalidContactIdError,
  InvalidHandleError,
  InvalidDisplayNameError,
  NoLocalUsernameForHandleError,
} from "./errors"

import { UuidRegex } from "@/domain/shared"

export * from "./primitives"

export const checkedToContactId = (
  contactId: string,
): ContactId | InvalidContactIdError => {
  if (contactId.match(UuidRegex)) {
    return contactId as ContactId
  }

  return new InvalidContactIdError(contactId)
}

export const checkedToHandle = (handle: string): Handle | InvalidHandleError => {
  const normalizedHandle = handle.trim().toLowerCase()

  const username = checkedToUsername(normalizedHandle)
  if (!(username instanceof Error)) return username

  const lnAddress = checkedToLightningAddress(normalizedHandle)
  if (!(lnAddress instanceof Error)) return lnAddress

  return new InvalidHandleError(handle)
}

export const checkedToDisplayName = (value: string) => {
  if (value.match(/^[\p{Alpha}][\p{Alpha} -]{3,}/u)) {
    return value
  }

  return new InvalidDisplayNameError(value)
}

// the ledger only records a counterparty username for on-us transactions, so a handle is
// queryable there when it is a bare username or an address hosted by this instance
export const localUsernameFromHandle = ({
  handle,
  lnAddressDomain,
}: {
  handle: Handle
  lnAddressDomain: string
}): Username | NoLocalUsernameForHandleError => {
  const separator = handle.lastIndexOf("@")
  const hasDomain = separator > 0

  if (hasDomain) {
    const domain = handle.slice(separator + 1).toLowerCase()
    if (domain !== lnAddressDomain.trim().toLowerCase()) {
      return new NoLocalUsernameForHandleError(handle)
    }
  }

  const localPart = hasDomain ? handle.slice(0, separator) : handle
  const username = checkedToUsername(localPart)
  if (username instanceof Error) return new NoLocalUsernameForHandleError(handle)

  return username
}

export const contactToAccountContact = (contact: Contact): AccountContact => ({
  id: contact.handle,
  username: contact.handle,
  handle: contact.handle,
  alias: contact.displayName,
  transactionsCount: contact.transactionsCount,
})
