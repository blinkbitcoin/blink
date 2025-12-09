import { grpcSpendingLimitsToSpendingLimits } from "./convert"

import {
  CheckSpendingLimitRequest,
  RecordSpendingRequest,
  ReverseSpendingRequest,
} from "./proto/api_keys_pb"

import * as apiKeysGrpc from "./grpc-client"

import { handleCommonApiKeysErrors } from "./errors"

import { baseLogger } from "@/services/logger"
import { SpendingLimits } from "@/domain/api-keys"

export const ApiKeysService = (): IApiKeysService => {
  const getSpendingLimits = async ({
    apiKeyId,
    amountSats,
  }: {
    apiKeyId: string
    amountSats: number
  }): Promise<SpendingLimits | ApiKeysServiceError> => {
    try {
      const request = new CheckSpendingLimitRequest()
      request.setApiKeyId(apiKeyId)
      request.setAmountSats(amountSats)

      const response = await apiKeysGrpc.checkSpendingLimit(
        request,
        apiKeysGrpc.apiKeysMetadata,
      )

      const limits = grpcSpendingLimitsToSpendingLimits(response)

      return limits
    } catch (err) {
      baseLogger.error(
        { err, apiKeyId, amountSats },
        "Failed to get API key spending limits",
      )
      return handleCommonApiKeysErrors(err)
    }
  }

  const recordSpending = async ({
    apiKeyId,
    amountSats,
    transactionId,
  }: {
    apiKeyId: string
    amountSats: number
    transactionId: string
  }): Promise<true | ApiKeysServiceError> => {
    try {
      const request = new RecordSpendingRequest()
      request.setApiKeyId(apiKeyId)
      request.setAmountSats(amountSats)
      request.setTransactionId(transactionId)

      await apiKeysGrpc.recordSpending(request, apiKeysGrpc.apiKeysMetadata)

      return true
    } catch (err) {
      baseLogger.error(
        { err, apiKeyId, amountSats, transactionId },
        "Failed to record API key spending",
      )
      return handleCommonApiKeysErrors(err)
    }
  }

  const reverseSpending = async ({
    transactionId,
  }: {
    transactionId: string
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

  return {
    getSpendingLimits,
    recordSpending,
    reverseSpending,
  }
}
