type SettledTransactionCursor = AsyncIterable<ILedgerTransaction> & {
  close: () => Promise<unknown>
}

type SettledTransactionFindQuery = {
  sort: (sort: Record<string, 1 | -1>) => {
    cursor: (options: { batchSize: number }) => SettledTransactionCursor
  }
}

type SettledTransactionChangeStream = {
  next: () => Promise<unknown>
  close: () => Promise<unknown>
}

type SettledTransactionModel = {
  find: (filter: Record<string, unknown>) => SettledTransactionFindQuery
  watch: (
    pipeline: Record<string, unknown>[],
    options: { fullDocument: "updateLookup" },
  ) => SettledTransactionChangeStream
}

type StreamSettledTransactionsConfig = {
  transactionModel: SettledTransactionModel
  translateLedgerTransaction?: (
    tx: ILedgerTransaction,
  ) => LedgerTransaction<WalletCurrency>
  maxReplayDedupeCacheSize?: number
}
