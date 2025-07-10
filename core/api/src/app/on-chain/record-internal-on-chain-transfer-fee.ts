import { toSats } from "@/domain/bitcoin"
import { LedgerService } from "@/services/ledger"

export const recordInternalOnChainTransferFee = async ({
  payoutId,
  satoshis,
  proportionalFee,
  txId,
}: {
  payoutId: PayoutId
  satoshis: BtcPaymentAmount
  proportionalFee: BtcPaymentAmount
  txId: OnChainTxHash
}): Promise<true | ApplicationError> => {
  const description = `fee for rebalance of ${satoshis.amount} sats`

  const ledgerService = LedgerService()
  const journal = await ledgerService.recordInternalOnChainTransferFee({
    payoutId,
    fee: toSats(proportionalFee.amount),
    txHash: txId,
    description,
  })
  if (journal instanceof Error) return journal

  return true
}
