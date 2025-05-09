import { contactCreate } from "./contact-create"

import { ContactType } from "@/domain/contacts"

export const IntraledgerContactCreate = async ({
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
    const contactToPayerResult = await contactCreate({
      accountId: senderAccount.id,
      identifier: recipientAccount.username,
      alias: recipientAccount.username,
      type: ContactType.IntraLedger,
    })
    if (contactToPayerResult instanceof Error) return contactToPayerResult
  }

  if (senderAccount.username) {
    const contactToPayeeResult = await contactCreate({
      accountId: recipientAccount.id,
      identifier: senderAccount.username,
      alias: senderAccount.username,
      type: ContactType.IntraLedger,
    })
    if (contactToPayeeResult instanceof Error) return contactToPayeeResult
  }

  return true
}
