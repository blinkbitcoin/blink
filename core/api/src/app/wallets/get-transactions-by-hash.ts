import { translateLedgerTransactions } from "./translate-ledger-transactions"

import { LedgerService } from "@/services/ledger"

export const getTransactionsForWalletByPaymentHash = async ({
  walletId,
  paymentHash,
}: {
  walletId: WalletId
  paymentHash: PaymentHash
}): Promise<WalletTransaction[] | ApplicationError> => {
  const ledger = LedgerService()
  const ledgerTransactions = await ledger.getTransactionsForWalletByPaymentHash({
    walletId,
    paymentHash,
  })

  if (ledgerTransactions instanceof Error) return ledgerTransactions

  return translateLedgerTransactions(ledgerTransactions)
}

export const getTransactionsByHash = async (
  hash: PaymentHash | OnChainTxHash,
): Promise<WalletTransaction[] | ApplicationError> => {
  const ledger = LedgerService()
  const ledgerTransactions = await ledger.getTransactionsByHash(hash)
  if (ledgerTransactions instanceof Error) return ledgerTransactions
  return translateLedgerTransactions(ledgerTransactions)
}
