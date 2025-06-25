import { checkedToAccountId, checkedToContactAlias } from "@/domain/accounts"
import { ContactNotExistentError } from "@/domain/errors"
import { ContactsRepository } from "@/services/mongoose"

export const updateContactAlias = async ({
  accountId: accountIdRaw,
  username,
  alias,
}: {
  accountId: string
  username: string
  alias: string
}): Promise<AccountContact | ApplicationError> => {
  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const aliasChecked = checkedToContactAlias(alias)
  if (aliasChecked instanceof Error) return aliasChecked

  const contacts = await ContactsRepository().listByAccountId(accountId)
  if (contacts instanceof Error) return contacts

  const contact = contacts.find(
    (contact) => contact.handle.toLowerCase() === username.toLowerCase(),
  )
  if (!contact) {
    return new ContactNotExistentError()
  }

  contact.displayName = aliasChecked

  const result = await ContactsRepository().update(contact)
  if (result instanceof Error) {
    return result
  }

  return {
    id: contact.handle as Username,
    username: contact.handle as Username,
    alias: aliasChecked,
    transactionsCount: contact.transactionsCount,
  }
}
