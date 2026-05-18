import { LedgerTransactionType } from "@/domain/ledger"
import { CacheKeys } from "@/domain/cache"

export const TransactionsStreamTransactionType = {
  Sent: "sent",
  Received: "received",
} as const

export const TransactionsStreamSettlementVia = {
  Unspecified: "unspecified",
  Lightning: "lightning",
  Intraledger: "intraledger",
  Onchain: "onchain",
} as const

export const ledgerTransactionTypeToTransactionsStreamSettlementVia = (
  ledgerTransactionType: LedgerTransactionType,
): TransactionsStreamSettlementVia => {
  switch (ledgerTransactionType) {
    case LedgerTransactionType.Invoice:
    case LedgerTransactionType.Payment:
      return TransactionsStreamSettlementVia.Lightning
    case LedgerTransactionType.IntraLedger:
    case LedgerTransactionType.LnIntraLedger:
    case LedgerTransactionType.WalletIdTradeIntraAccount:
    case LedgerTransactionType.LnTradeIntraAccount:
      return TransactionsStreamSettlementVia.Intraledger
    case LedgerTransactionType.OnchainReceipt:
    case LedgerTransactionType.OnchainPayment:
    case LedgerTransactionType.OnchainIntraLedger:
    case LedgerTransactionType.OnChainTradeIntraAccount:
      return TransactionsStreamSettlementVia.Onchain
    default:
      return TransactionsStreamSettlementVia.Unspecified
  }
}

export const ledgerTransactionCreditToTransactionsStreamTransactionType = (
  credit: number,
): TransactionsStreamTransactionType =>
  credit > 0
    ? TransactionsStreamTransactionType.Received
    : TransactionsStreamTransactionType.Sent

export const transactionsStreamWalletAccountIdCacheKey = (walletId: WalletId) =>
  `${CacheKeys.TransactionsStreamWalletAccountId}:${walletId}`

export const ledgerTransactionToTransactionStreamEvent = ({
  ledgerTransaction,
  accountId,
}: LedgerTransactionToTransactionStreamEventArgs): TransactionStreamEvent | undefined => {
  const walletId = ledgerTransaction.walletId
  if (!walletId) return undefined

  return {
    ledgerTransactionId: ledgerTransaction.id,
    walletId,
    accountId,
    paymentHash: ledgerTransaction.paymentHash,
    satsAmount: ledgerTransaction.satsAmount ?? 0,
    centsAmount: ledgerTransaction.centsAmount ?? 0,
    currency: ledgerTransaction.currency,
    type: ledgerTransactionCreditToTransactionsStreamTransactionType(
      ledgerTransaction.credit,
    ),
    settlementVia: ledgerTransactionTypeToTransactionsStreamSettlementVia(
      ledgerTransaction.type,
    ),
    pending: ledgerTransaction.pendingConfirmation,
    timestamp: ledgerTransaction.timestamp,
  }
}
