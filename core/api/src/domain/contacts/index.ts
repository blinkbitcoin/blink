import { InvalidContactIdError, InvalidHandleError } from "./errors"

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

export const checkedToHandle = (handle: string): string | InvalidHandleError => {
  const trimmed = handle.trim()

  if (
    typeof trimmed !== "string" ||
    trimmed.length === 0 ||
    trimmed.length > 256 ||
    /\s/.test(trimmed)
  ) {
    return new InvalidHandleError(handle)
  }

  return trimmed
}

export const checkedToDisplayName = (value: string) => {
  if (value.match(/^[\p{Alpha}][\p{Alpha} -]{3,}/u)) {
    return value
  }

  return new InvalidHandleError(value)
}
