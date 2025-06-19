import { CouldNotFindContactFromAccountIdError } from "@/domain/errors"
import { ContactsRepository } from "@/services/mongoose"

export const contactCreate = async ({
  accountId,
  handle,
  displayName,
  type,
}: {
  accountId: AccountId
  handle: string
  type: ContactType
  displayName: string
}): Promise<Contact | ApplicationError> => {
  const contactsRepo = ContactsRepository()

  const existing = await contactsRepo.findContact({ accountId, handle })
  if (existing instanceof CouldNotFindContactFromAccountIdError) {
    return contactsRepo.persistNew({
      accountId,
      handle,
      type,
      displayName,
      transactionsCount: 1,
    })
  }

  if (existing instanceof Error) return existing

  return contactsRepo.update({
    ...existing,
    displayName,
    transactionsCount: existing.transactionsCount + 1,
  })
}
