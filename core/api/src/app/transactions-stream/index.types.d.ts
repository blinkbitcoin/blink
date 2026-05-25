type SubscribeToTransactionsArgs = {
  afterTransactionId?: string
  onTransaction: (event: TransactionStreamEvent) => void | Promise<void>
  onError: (err: Error) => void
}

type TransactionsStreamSubscription = {
  close: () => void
}

type TransactionsStreamAccountIdForWalletIdArgs = {
  walletId: WalletId
  cacheService: ICacheService
  walletsRepository: Pick<IWalletsRepository, "findById">
}
