import { NoContactForUsernameError } from "@/domain/errors"

import { ContactsRepository } from "@/services/mongoose"

export const getContactByUsername = async ({
  account,
  contactUsername,
}: {
  account: Account
  contactUsername: string
}): Promise<AccountContact | ApplicationError> => {
  const contacts = await ContactsRepository().listByAccountId(account.id)
  if (contacts instanceof Error) return contacts

  const contact = contacts.find(
    (contact) => contact.handle.toLowerCase() === contactUsername.toLowerCase(),
  )
  if (!contact) return new NoContactForUsernameError()

  return {
    id: contact.handle as Username,
    username: contact.handle as Username,
    alias: contact.displayName as ContactAlias,
    transactionsCount: contact.transactionsCount,
  }
}

export const getContactsByAccountId = async (
  accountId: AccountId,
): Promise<AccountContact[] | ApplicationError> => {
  const contacts = await ContactsRepository().listByAccountId(accountId)
  if (contacts instanceof Error) return contacts

  return contacts.map((contact) => ({
    id: contact.handle as Username,
    username: contact.handle as Username,
    alias: contact.displayName as ContactAlias,
    transactionsCount: contact.transactionsCount,
  }))
}
