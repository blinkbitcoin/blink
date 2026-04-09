import {
  lockApiKeySpending,
  reverseApiKeySpendingSettlement,
  recordApiKeySpendingSettlement,
  settleApiKeySpending,
} from "./api-key-spending"

import {
  checkIntraledgerLimits,
  checkTradeIntraAccountLimits,
  checkWithdrawalLimits,
} from "@/app/accounts"

import { ErrorLevel } from "@/domain/shared"
import { SettlementMethod } from "@/domain/wallets"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

export const SpendingLimitsSettlement = {
  Record: "record",
  Reverse: "reverse",
} as const

export const recordSettlement = ({
  result,
  settlementTransactionId,
}: {
  result: PaymentSendResult | ApplicationError
  settlementTransactionId: LedgerJournalId
}): SpendingLimitsExecutionResult => ({
  apiKeySettlement: SpendingLimitsSettlement.Record,
  settlementTransactionId,
  result,
})

export const reverseSettlement = ({
  result,
}: {
  result: PaymentSendResult | ApplicationError
}): SpendingLimitsExecutionResult => ({
  apiKeySettlement: SpendingLimitsSettlement.Reverse,
  result,
})

const settlementFor = (
  executionResult: SpendingLimitsExecutionResult,
): ApiKeySpendingSettlement => {
  const { apiKeySettlement } = executionResult

  if (
    apiKeySettlement === SpendingLimitsSettlement.Record &&
    !executionResult.settlementTransactionId
  ) {
    recordExceptionInCurrentSpan({
      error: new Error(
        "Invalid spending settlement result: record settlement without transaction id",
      ),
      level: ErrorLevel.Critical,
    })
    return reverseApiKeySpendingSettlement()
  }

  switch (apiKeySettlement) {
    case SpendingLimitsSettlement.Record:
      return recordApiKeySpendingSettlement(executionResult.settlementTransactionId)

    case SpendingLimitsSettlement.Reverse:
      return reverseApiKeySpendingSettlement()

    default: {
      const exhaustiveCheck: never = apiKeySettlement
      return exhaustiveCheck
    }
  }
}

const getLimitCheck = ({
  settlementMethod,
  accountId,
  recipientAccountId,
}: {
  settlementMethod: SettlementMethod
  accountId: AccountId
  recipientAccountId?: AccountId
}) => {
  if (settlementMethod !== SettlementMethod.IntraLedger) return checkWithdrawalLimits
  if (accountId === recipientAccountId) return checkTradeIntraAccountLimits
  return checkIntraledgerLimits
}

export const withSpendingLimits = async ({
  settlementMethod,
  accountId,
  recipientAccountId,
  usdPaymentAmount,
  priceRatioForLimits,
  apiKeyId,
  btcPaymentAmount,
  execute,
}: {
  settlementMethod: SettlementMethod
  accountId: AccountId
  recipientAccountId?: AccountId
  usdPaymentAmount: UsdPaymentAmount
  priceRatioForLimits: WalletPriceRatio
  apiKeyId?: ApiKeyId
  btcPaymentAmount: BtcPaymentAmount
  execute: () => Promise<SpendingLimitsExecutionResult>
}): Promise<PaymentSendResult | ApplicationError> => {
  const checkLimit = getLimitCheck({ settlementMethod, accountId, recipientAccountId })

  const limitCheck = await checkLimit({
    amount: usdPaymentAmount,
    accountId,
    priceRatio: priceRatioForLimits,
  })
  if (limitCheck instanceof Error) return limitCheck

  const lock = await lockApiKeySpending({ apiKeyId, amount: btcPaymentAmount })
  if (lock instanceof Error) return lock

  const executionResult = await execute()

  const settleResult = await settleApiKeySpending({
    lock,
    settlement: settlementFor(executionResult),
  })
  if (settleResult instanceof Error) {
    recordExceptionInCurrentSpan({ error: settleResult })
  }

  return executionResult.result
}
