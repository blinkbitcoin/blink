import { ApiKeysService } from "@/services/api-keys"
const apiKeys = ApiKeysService()

export const ApiKeySpendingSettlementType = {
  Record: "record",
  Reverse: "reverse",
} as const

export const recordApiKeySpendingSettlement = (
  transactionId: LedgerJournalId,
): ApiKeySpendingSettlement => ({
  type: ApiKeySpendingSettlementType.Record,
  transactionId,
})

export const reverseApiKeySpendingSettlement = (): ApiKeySpendingSettlement => ({
  type: ApiKeySpendingSettlementType.Reverse,
})

export const lockApiKeySpending = async ({
  apiKeyId,
  amount,
}: {
  apiKeyId?: ApiKeyId
  amount: BtcPaymentAmount
}): Promise<ApiKeySpendingLock | ApplicationError | undefined> => {
  if (!apiKeyId) return undefined

  const ephemeralId = await apiKeys.checkAndLockSpending({
    apiKeyId,
    amount,
  })
  if (ephemeralId instanceof Error) return ephemeralId

  return {
    apiKeyId,
    amount,
    ephemeralId,
  }
}

export const settleApiKeySpending = async ({
  lock,
  settlement,
}: {
  lock?: ApiKeySpendingLock
  settlement: ApiKeySpendingSettlement
}): Promise<true | ApplicationError> => {
  if (!lock) return true

  if (settlement.type === ApiKeySpendingSettlementType.Reverse) {
    const reverseResult = await apiKeys.reverseSpending({
      transactionId: lock.ephemeralId,
    })
    if (reverseResult instanceof Error) return reverseResult
    return true
  }

  const recordResult = await apiKeys.recordSpending({
    apiKeyId: lock.apiKeyId,
    amount: lock.amount,
    transactionId: settlement.transactionId,
    ephemeralId: lock.ephemeralId,
  })
  if (recordResult instanceof Error) return recordResult

  return true
}
