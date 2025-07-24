import { checkedToAccountId, checkedToContactAlias } from "@/domain/accounts"
import { checkedToHandle } from "@/domain/contacts"

import { ContactsRepository } from "@/services/mongoose"

export const updateContactAlias = async ({
  accountId: accountIdRaw,
  handle,
  alias,
}: {
  accountId: string
  handle: string
  alias: string
}): Promise<AccountContact | ApplicationError> => {
  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const aliasChecked = checkedToContactAlias(alias)
  if (aliasChecked instanceof Error) return aliasChecked

  const validatedHandle = checkedToHandle(handle)
  if (validatedHandle instanceof Error) return validatedHandle

  const contact = await ContactsRepository().findByHandle({
    handle: validatedHandle,
    accountId,
  })
  if (contact instanceof Error) return contact

  contact.displayName = aliasChecked

  const result = await ContactsRepository().update(contact)
  if (result instanceof Error) {
    return result
  }

  return {
    id: contact.handle,
    handle: contact.handle,
    username: contact.handle,
    alias: aliasChecked,
    transactionsCount: contact.transactionsCount,
  }
}
