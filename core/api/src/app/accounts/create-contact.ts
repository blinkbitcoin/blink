import { checkedToHandle, ContactType } from "@/domain/contacts"
import {
  CouldNotFindContactFromAccountIdError,
  InvalidHandleError,
} from "@/domain/contacts/errors"

import { ContactsRepository } from "@/services/mongoose"
import { checkedToContactAlias } from "@/domain/accounts"

export const createContact = async ({
  accountId,
  handle,
  displayName,
  type,
}: {
  accountId: AccountId
  handle: string
  type: ContactType
  displayName: ContactAlias
}): Promise<Contact | ApplicationError> => {
  const contactsRepo = ContactsRepository()

  const validatedHandle = checkedToHandle(handle)
  if (validatedHandle instanceof InvalidHandleError) {
    return validatedHandle
  }

  const existing = await contactsRepo.findByHandle({ accountId, handle: validatedHandle })
  if (existing instanceof CouldNotFindContactFromAccountIdError) {
    return contactsRepo.persistNew({
      accountId,
      handle: validatedHandle,
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
    const alias = checkedToContactAlias(recipientAccount.username)
    if (alias instanceof Error) return alias

    const contactToPayerResult = await createContact({
      accountId: senderAccount.id,
      handle: recipientAccount.username,
      displayName: alias,
      type: ContactType.IntraLedger,
    })
    if (contactToPayerResult instanceof Error) return contactToPayerResult
  }

  if (senderAccount.username) {
    const alias = checkedToContactAlias(senderAccount.username)
    if (alias instanceof Error) return alias

    const contactToPayeeResult = await createContact({
      accountId: recipientAccount.id,
      handle: senderAccount.username,
      displayName: alias,
      type: ContactType.IntraLedger,
    })
    if (contactToPayeeResult instanceof Error) return contactToPayeeResult
  }

  return true
}
