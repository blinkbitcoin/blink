import { translateLedgerTransaction } from "./translate-ledger-transactions"

import { checkedToLedgerTransactionId } from "@/domain/ledger"

import { LedgerService } from "@/services/ledger"

export const getTransactionForWalletById = async ({
  walletId,
  transactionId: uncheckedTransactionId,
}: {
  walletId: WalletId
  transactionId: string
}): Promise<WalletTransaction | ApplicationError> => {
  const ledger = LedgerService()

  const ledgerTransactionId = checkedToLedgerTransactionId(uncheckedTransactionId)
  if (ledgerTransactionId instanceof Error) return ledgerTransactionId

  const ledgerTransaction = await ledger.getTransactionForWalletById({
    walletId,
    transactionId: ledgerTransactionId,
  })
  if (ledgerTransaction instanceof Error) return ledgerTransaction

  return translateLedgerTransaction(ledgerTransaction)
}

export const getTransactionById = async (
  id: string,
): Promise<WalletTransaction | ApplicationError> => {
  const ledger = LedgerService()

  const ledgerTxId = checkedToLedgerTransactionId(id)
  if (ledgerTxId instanceof Error) return ledgerTxId

  const ledgerTransaction = await ledger.getTransactionById(ledgerTxId)
  if (ledgerTransaction instanceof Error) return ledgerTransaction

  return translateLedgerTransaction(ledgerTransaction)
}
