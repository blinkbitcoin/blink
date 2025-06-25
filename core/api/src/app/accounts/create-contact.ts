import { CouldNotFindContactFromAccountIdError } from "@/domain/errors"
import { ContactType } from "@/domain/contacts"

import { ContactsRepository } from "@/services/mongoose"

export const createContact = async ({
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

  const existing = await contactsRepo.findByHandle({ accountId, handle })
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

export const createIntraledgerContact = async ({
  senderAccount,
  recipientAccount,
}: {
  senderAccount: Account
  recipientAccount: Account
}): Promise<true | ApplicationError> => {
  if (!(senderAccount.contactEnabled && recipientAccount.contactEnabled)) {
    return true
  }

  if (recipientAccount.username) {
    const contactToPayerResult = await createContact({
      accountId: senderAccount.id,
      handle: recipientAccount.username,
      displayName: recipientAccount.username,
      type: ContactType.IntraLedger,
    })
    if (contactToPayerResult instanceof Error) return contactToPayerResult
  }

  if (senderAccount.username) {
    const contactToPayeeResult = await createContact({
      accountId: recipientAccount.id,
      handle: senderAccount.username,
      displayName: senderAccount.username,
      type: ContactType.IntraLedger,
    })
    if (contactToPayeeResult instanceof Error) return contactToPayeeResult
  }

  return true
}
