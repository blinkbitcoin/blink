import { checkedToHandle, contactToAccountContact } from "@/domain/contacts"
import { CouldNotFindContactFromAccountIdError } from "@/domain/contacts/errors"
import { NoContactForHandleError } from "@/domain/errors"

import { ContactsRepository } from "@/services/mongoose"

export const getContactByHandle = async ({
  accountId,
  handle: handleRaw,
}: {
  accountId: AccountId
  handle: string
}): Promise<AccountContact | ApplicationError> => {
  const handle = checkedToHandle(handleRaw)
  if (handle instanceof Error) return handle

  const contact = await ContactsRepository().findByHandle({ accountId, handle })
  if (contact instanceof CouldNotFindContactFromAccountIdError) {
    return new NoContactForHandleError(handleRaw)
  }
  if (contact instanceof Error) return contact

  return contactToAccountContact(contact)
}
