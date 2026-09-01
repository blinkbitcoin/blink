import { translateLedgerTransaction } from "./translate-ledger-transactions"

import { LedgerService } from "@/services/ledger"

export const getTransactionForWalletByJournalId = async ({
  walletId,
  journalId,
}: {
  walletId: WalletId
  journalId: LedgerJournalId
}): Promise<WalletTransaction | ApplicationError> => {
  const ledger = LedgerService()

  const ledgerTransaction = await ledger.getTransactionForWalletByJournalId({
    walletId,
    journalId,
  })
  if (ledgerTransaction instanceof Error) return ledgerTransaction

  return translateLedgerTransaction(ledgerTransaction)
}
