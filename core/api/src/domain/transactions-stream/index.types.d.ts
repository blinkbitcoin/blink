type TransactionsStreamTransactionType =
  (typeof import("./index").TransactionsStreamTransactionType)[keyof typeof import("./index").TransactionsStreamTransactionType]

type TransactionsStreamSettlementVia =
  (typeof import("./index").TransactionsStreamSettlementVia)[keyof typeof import("./index").TransactionsStreamSettlementVia]

type TransactionStreamEvent = {
  readonly ledgerTransactionId: LedgerTransactionId
  readonly walletId: WalletId
  readonly accountId: AccountId | undefined
  readonly paymentHash: string | undefined
  readonly preimage: string | undefined
  readonly satsAmount: number
  readonly centsAmount: number
  readonly currency: WalletCurrency
  readonly type: TransactionsStreamTransactionType
  readonly settlementVia: TransactionsStreamSettlementVia
  readonly pending: boolean
  readonly timestamp: Date | undefined
}
