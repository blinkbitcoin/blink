type SubscribeToTransactionsArgs = {
  afterTransactionId?: string
  onTransaction: (event: TransactionStreamEvent) => void | Promise<void>
  onError: (err: Error) => void
}

type TransactionsStreamSubscription = {
  close: () => void
}

type TransactionsStreamConfig = {
  ledgerService?: Pick<ILedgerService, "streamSettledTransactions">
  mapTransactionStreamEvent?: (
    ledgerTransaction: LedgerTransaction<WalletCurrency>,
  ) => Promise<TransactionStreamEvent | undefined>
  logger?: Logger
}

type TransactionsStreamTimestampedValue<T> = {
  value: T
  expiresAt: number
}

type TransactionsStreamExpiringCacheOptions = {
  ttlMs: number
  maxSize: number
}

type TransactionsStreamPreimageLoaderArgs = {
  transactionId: LedgerTransactionId
  paymentHash?: PaymentHash
}

type TransactionsStreamAccountIdLoader = (
  walletId: WalletId,
) => Promise<AccountId | undefined>

type TransactionsStreamPreimageLoader = (
  args: TransactionsStreamPreimageLoaderArgs,
) => Promise<string>

type TransactionsStreamAccountIdResolver = (
  walletId: WalletId,
) => Promise<AccountId | undefined>

type TransactionsStreamPreimageResolver = (
  args: TransactionsStreamPreimageLoaderArgs,
) => Promise<string>

type TransactionsStreamFindWalletById = (
  walletId: WalletId,
) => Promise<{ accountId: AccountId } | Error | undefined>

type TransactionsStreamFindTransactionMetadataById = (
  transactionId: LedgerTransactionId,
) => Promise<Pick<TransactionMetadataRecord, "revealedPreImage"> | null | undefined>

type TransactionsStreamFindWalletInvoiceById = (
  paymentHash: string,
) => Promise<Pick<WalletInvoiceRecord, "secret"> | null | undefined>

type TransactionsStreamAccountIdLoaderConfig = {
  findWalletById?: TransactionsStreamFindWalletById
}

type TransactionsStreamPreimageLoaderConfig = {
  findTransactionMetadataById?: TransactionsStreamFindTransactionMetadataById
  findWalletInvoiceById?: TransactionsStreamFindWalletInvoiceById
}

type TransactionsStreamAccountIdResolverConfig = {
  walletToAccountCache?: Map<WalletId, AccountId | undefined>
  loadAccountId?: TransactionsStreamAccountIdLoader
}

type TransactionsStreamPreimageCache = {
  get: (key: string) => string | undefined
  set: (key: string, value: string) => void
}

type TransactionsStreamPreimageResolverConfig = {
  preimageCache?: TransactionsStreamPreimageCache
  loadPreimage?: TransactionsStreamPreimageLoader
}

type TransactionStreamEventMapperConfig = {
  resolveAccountId?: TransactionsStreamAccountIdResolver
  resolvePreimage?: TransactionsStreamPreimageResolver
}
