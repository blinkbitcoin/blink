import { checkedToLightningAddress, checkedToUsername } from "../accounts"

import {
  InvalidContactIdError,
  InvalidHandleError,
  InvalidDisplayNameError,
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
  const username = checkedToUsername(handle)
  if (!(username instanceof Error)) return handle as Handle

  const lnAddress = checkedToLightningAddress(handle)
  if (!(lnAddress instanceof Error)) return handle as Handle

  return new InvalidHandleError(handle)
}

export const checkedToDisplayName = (value: string) => {
  if (value.match(/^[\p{Alpha}][\p{Alpha} -]{3,}/u)) {
    return value
  }

  return new InvalidDisplayNameError(value)
}
