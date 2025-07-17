import { checkedToHandle } from "@/domain/contacts"
import { NoContactForUsernameError } from "@/domain/errors"
import { InvalidHandleError } from "@/domain/contacts/errors"

import { ContactsRepository } from "@/services/mongoose"

export const getContactByHandle = async ({
  account,
  handle,
}: {
  account: Account
  handle: string
}): Promise<AccountContact | ApplicationError> => {
  const validatedHandle = checkedToHandle(handle)
  if (validatedHandle instanceof InvalidHandleError) {
    return validatedHandle
  }

  const contact = await ContactsRepository().findByHandle({
    accountId: account.id,
    handle: validatedHandle,
  })
  if (contact instanceof Error) return new NoContactForUsernameError()

  return {
    id: contact.handle,
    username: contact.handle,
    alias: contact.displayName,
    transactionsCount: contact.transactionsCount,
  }
}

export const getContactsByAccountId = async (
  accountId: AccountId,
): Promise<AccountContact[] | ApplicationError> => {
  const contacts = await ContactsRepository().listByAccountId(accountId)
  if (contacts instanceof Error) return contacts

  return contacts.map((contact) => ({
    id: contact.handle,
    username: contact.handle,
    alias: contact.displayName,
    transactionsCount: contact.transactionsCount,
  }))
}
