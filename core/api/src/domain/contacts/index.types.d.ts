type ContactType =
  (typeof import("./primitives").ContactType)[keyof typeof import("./primitives").ContactType]

type Handle = Username | LightningAddress

type Contact = {
  readonly id: ContactId
  readonly createdAt: Date
  accountId: AccountId
  type: ContactType
  handle: Username
  displayName: ContactAlias
  transactionsCount: number
  updatedAt?: Date
}

type NewContactInput = Omit<Contact, "id" | "createdAt" | "updatedAt">

interface IContactsRepository {
  findByHandle({
    accountId,
    handle,
  }: {
    accountId: AccountId
    handle: Handle
  }): Promise<Contact | RepositoryError>

  listByAccountId(accountId: string): Promise<Contact[] | RepositoryError>

  persistNew(contact: NewContactInput): Promise<Contact | RepositoryError>

  update(contact: Contact): Promise<Contact | RepositoryError>
}
