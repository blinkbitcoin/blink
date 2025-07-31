import { parseRepositoryError } from "./utils"

import {
  CouldNotFindContactFromAccountIdError,
  CouldNotUpdateContactError,
} from "@/domain/contacts/errors"

import { Contact } from "@/services/mongoose/schema"

export const ContactsRepository = (): IContactsRepository => {
  const findByHandle = async ({
    accountId,
    handle,
  }: {
    accountId: AccountId
    handle: Handle
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
    contactInput: NewContact,
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

  const listByAccountId = async ({
    accountId,
  }: {
    accountId: AccountId
  }): Promise<Contact[] | RepositoryError> => {
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
        contact,
        { new: true },
      )
      if (!result) return new CouldNotUpdateContactError()

      return contactFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    listByAccountId,
    findByHandle,
    persistNew,
    update,
  }
}

const contactFromRaw = (result: ContactRecord): Contact => ({
  id: result.id as ContactId,
  accountId: result.accountId as AccountId,
  handle: result.handle as Username,
  type: result.type as ContactType,
  displayName: (result.displayName || "") as ContactAlias,
  transactionsCount: result.transactionsCount,
  createdAt: result.createdAt,
})
