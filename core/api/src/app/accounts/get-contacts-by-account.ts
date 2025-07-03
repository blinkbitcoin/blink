import { NoContactForUsernameError } from "@/domain/errors"

import { ContactsRepository } from "@/services/mongoose"

export const getContactByUsername = async ({
  account,
  contactUsername,
}: {
  account: Account
  contactUsername: Username
}): Promise<AccountContact | ApplicationError> => {
  const contact = await ContactsRepository().findByHandle({
    accountId: account.id,
    handle: contactUsername,
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
