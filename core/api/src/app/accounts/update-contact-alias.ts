import { checkedToAccountId, checkedToContactAlias } from "@/domain/accounts"

import { ContactsRepository } from "@/services/mongoose"

export const updateContactAlias = async ({
  accountId: accountIdRaw,
  username,
  alias,
}: {
  accountId: AccountId
  username: Username
  alias: ContactAlias
}): Promise<AccountContact | ApplicationError> => {
  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const aliasChecked = checkedToContactAlias(alias)
  if (aliasChecked instanceof Error) return aliasChecked

  const contact = await ContactsRepository().findByHandle({
    accountId,
    handle: username,
  })
  if (contact instanceof Error) return contact

  contact.displayName = aliasChecked

  const result = await ContactsRepository().update(contact)
  if (result instanceof Error) {
    return result
  }

  return {
    id: contact.handle,
    username: contact.handle,
    alias: aliasChecked,
    transactionsCount: contact.transactionsCount,
  }
}
