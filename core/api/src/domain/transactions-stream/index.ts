import { LedgerTransactionType } from "@/domain/ledger"

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
