type ContactType =
  (typeof import("./primitives").ContactType)[keyof typeof import("./primitives").ContactType]

type Handle = Username | LightningAddress

type Contact = {
  readonly id: ContactId
  readonly createdAt: Date
  accountId: AccountId
  type: ContactType
  handle: Handle
  displayName: ContactAlias
  transactionsCount: number
  updatedAt?: Date
}

type NewContact = Omit<Contact, "id" | "createdAt" | "updatedAt">

interface IContactsRepository {
  findByHandle({
    accountId,
    handle,
  }: {
    accountId: AccountId
    handle: Handle
  }): Promise<Contact | RepositoryError>

  listByAccountId({
    accountId,
  }: {
    accountId: AccountId
  }): Promise<Contact[] | RepositoryError>

  persistNew(contact: NewContact): Promise<Contact | RepositoryError>

  update(contact: Contact): Promise<Contact | RepositoryError>
}
