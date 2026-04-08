import {
  CheckAndLockSpendingRequest,
  RecordSpendingRequest,
  ReverseSpendingRequest,
} from "./proto/api_keys_pb"

import * as apiKeysGrpc from "./grpc-client"

import { handleCommonApiKeysErrors } from "./errors"

import { baseLogger } from "@/services/logger"
import { wrapAsyncFunctionsToRunInSpan } from "@/services/tracing"

export const ApiKeysService = (): IApiKeysService => {
  const checkAndLockSpending = async ({
    apiKeyId,
    amount,
  }: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
  }): Promise<EphemeralId | ApiKeysServiceError> => {
    try {
      const amountSats = Number(amount.amount)
      const request = new CheckAndLockSpendingRequest()
      request.setApiKeyId(apiKeyId)
      request.setAmountSats(amountSats)

      const response = await apiKeysGrpc.checkAndLockSpending(
        request,
        apiKeysGrpc.apiKeysMetadata,
      )

      return response.getEphemeralId() as EphemeralId
    } catch (err) {
      baseLogger.error({ err, apiKeyId, amount }, "Failed to check and lock spending")
      return handleCommonApiKeysErrors(err)
    }
  }

  const recordSpending = async ({
    apiKeyId,
    amount,
    transactionId,
    ephemeralId,
  }: {
    apiKeyId: ApiKeyId
    amount: BtcPaymentAmount
    transactionId: LedgerJournalId
    ephemeralId: EphemeralId
  }): Promise<true | ApiKeysServiceError> => {
    try {
      const amountSats = Number(amount.amount)
      const request = new RecordSpendingRequest()
      request.setApiKeyId(apiKeyId)
      request.setAmountSats(amountSats)
      request.setTransactionId(transactionId)
      request.setEphemeralId(ephemeralId)

      await apiKeysGrpc.recordSpending(request, apiKeysGrpc.apiKeysMetadata)

      return true
    } catch (err) {
      baseLogger.error(
        { err, apiKeyId, amount, transactionId, ephemeralId },
        "Failed to record API key spending",
      )
      return handleCommonApiKeysErrors(err)
    }
  }

  const reverseSpending = async ({
    transactionId,
  }: {
    transactionId: LedgerJournalId | EphemeralId
  }): Promise<true | ApiKeysServiceError> => {
    try {
      const request = new ReverseSpendingRequest()
      request.setTransactionId(transactionId)

      await apiKeysGrpc.reverseSpending(request, apiKeysGrpc.apiKeysMetadata)

      return true
    } catch (err) {
      baseLogger.error({ err, transactionId }, "Failed to reverse API key spending")
      return handleCommonApiKeysErrors(err)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.api-keys",
    fns: {
      checkAndLockSpending,
      recordSpending,
      reverseSpending,
    },
  })
}
