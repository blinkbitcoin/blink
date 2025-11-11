type Usernames = {
  accountId: AccountId
  walletId?: WalletId
  handle: Username
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

type UsernamesInput = Omit<Usernames, "createdAt" | "updatedAt">

interface IUsernamesRepository {
  findByHandle(handle: string): Promise<Usernames | RepositoryError>

  listByAccountId(accountId: AccountId): Promise<Usernames[] | RepositoryError>

  findDefaultByAccountId(accountId: AccountId): Promise<Usernames | RepositoryError>

  update(input: UsernamesInput): Promise<Usernames | RepositoryError>
}
