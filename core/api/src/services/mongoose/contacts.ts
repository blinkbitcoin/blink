import { parseRepositoryError } from "./utils"

import { Contact } from "@/services/mongoose/schema"
import {
  RepositoryError,
  CouldNotUpdateContactError,
  CouldNotFindContactFromAccountIdError,
} from "@/domain/errors"

export const ContactsRepository = (): IContactsRepository => {
  const findContact = async ({
    accountId,
    handle,
  }: {
    accountId: AccountId
    handle: string
  }): Promise<Contact | RepositoryError> => {
    try {
      const result = await Contact.findOne({ accountId, handle })
      if (!result) {
        return new CouldNotFindContactFromAccountIdError(accountId)
      }

      return contactFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const persistNew = async (
    contactInput: NewContactInput,
  ): Promise<Contact | RepositoryError> => {
    try {
      const contact = await new Contact({
        ...contactInput,
      }).save()

      return contactFromRaw(contact)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const getContactsByAccountId = async (
    accountId: string,
  ): Promise<Contact[] | RepositoryError> => {
    try {
      const results = await Contact.find({ accountId })
      return results.map(contactFromRaw)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const update = async (contact: Contact): Promise<Contact | RepositoryError> => {
    try {
      const result = await Contact.findOneAndUpdate(
        { accountId: contact.accountId, id: contact.id },
        contactToRaw(contact),
        { new: true },
      )
      if (!result) return new CouldNotUpdateContactError()

      return contactFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    getContactsByAccountId,
    findContact,
    persistNew,
    update,
  }
}

const contactFromRaw = (result: ContactRecord): Contact => ({
  id: result.id as ContactId,
  accountId: result.accountId as AccountId,
  handle: result.handle,
  type: result.type as ContactType,
  displayName: result.displayName ?? "",
  transactionsCount: result.transactionsCount,
  createdAt: result.createdAt,
})

const contactToRaw = (contact: Contact): ContactRecord => ({
  id: contact.id,
  accountId: contact.accountId,
  handle: contact.handle,
  type: contact.type,
  displayName: contact.displayName,
  transactionsCount: contact.transactionsCount,
  createdAt: contact.createdAt,
})
