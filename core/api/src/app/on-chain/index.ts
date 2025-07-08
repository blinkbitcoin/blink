export * from "./rebalance-to-cold-wallet"
export * from "./rebalance-to-withdrawal-wallet"
export * from "./record-hot-to-cold-transfer"
export * from "./record-receive-to-withdrawal-transfer-fee"
export * from "./list-payout-queues"

import { OnChainService } from "@/services/bria"
import { LedgerService } from "@/services/ledger"

export const getHotBalance = async (): Promise<BtcPaymentAmount | ApplicationError> => {
  const service = OnChainService()
  return service.getHotBalance()
}

export const getColdBalance = async (): Promise<BtcPaymentAmount | ApplicationError> => {
  const service = OnChainService()
  return service.getColdBalance()
}

export const getBatchInclusionEstimatedAt = async ({
  ledgerTransactionId,
}: {
  ledgerTransactionId: LedgerTransactionId
}): Promise<number | undefined | ApplicationError> => {
  const ledgerTransaction = await LedgerService().getTransactionById(ledgerTransactionId)
  if (ledgerTransaction instanceof Error) {
    return ledgerTransaction
  }
  const payout = await OnChainService().findPayoutByLedgerJournalId(
    ledgerTransaction.journalId,
  )
  if (payout instanceof Error) {
    return payout
  }
  return payout.batchInclusionEstimatedAt
}
