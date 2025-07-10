import { checkedToAccountId, checkedToContactAlias } from "@/domain/accounts"
import { checkedToHandle } from "@/domain/contacts"

import { ContactsRepository } from "@/services/mongoose"

export const updateContactAlias = async ({
  accountId: accountIdRaw,
  username,
  alias,
}: {
  accountId: AccountId
  username: string
  alias: string
}): Promise<AccountContact | ApplicationError> => {
  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const aliasChecked = checkedToContactAlias(alias)
  if (aliasChecked instanceof Error) return aliasChecked

  const handle = checkedToHandle(username)
  if (handle instanceof Error) return handle

  const contact = await ContactsRepository().findByHandle({
    accountId,
    handle,
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
