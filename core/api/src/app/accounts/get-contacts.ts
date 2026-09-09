import { checkedToHandle, contactToAccountContact } from "@/domain/contacts"
import { NoContactForUsernameError } from "@/domain/errors"
import { InvalidHandleError } from "@/domain/contacts/errors"

import { ContactsRepository } from "@/services/mongoose"

export const getContactByUsername = async ({
  accountId,
  handle,
}: {
  accountId: AccountId
  handle: string
}): Promise<AccountContact | ApplicationError> => {
  const validatedHandle = checkedToHandle(handle)
  if (validatedHandle instanceof InvalidHandleError) {
    return validatedHandle
  }

  const contact = await ContactsRepository().findByHandle({
    accountId,
    handle: validatedHandle,
  })
  if (contact instanceof Error) return new NoContactForUsernameError()

  return contactToAccountContact(contact)
}

export const getContactsByAccountId = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<AccountContact[] | ApplicationError> => {
  const contacts = await ContactsRepository().listByAccountId({ accountId })
  if (contacts instanceof Error) return contacts

  return contacts.map(contactToAccountContact)
}
