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

import { PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { SettlementMethod } from "@/domain/wallets"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

// Records spending when a journal entry exists (settlementTransactionId is present),
// reverses the lock otherwise. AlreadyPaid and Failure are reversed even with a journal
// since no net new spending occurred.
const settlementFor = ({
  result,
  settlementTransactionId,
}: {
  result: PaymentSendResult | ApplicationError
  settlementTransactionId?: LedgerJournalId
}): ApiKeySpendingSettlement => {
  if (!settlementTransactionId) return reverseApiKeySpendingSettlement()

  if (result instanceof Error) {
    return recordApiKeySpendingSettlement(settlementTransactionId)
  }

  if (
    result.status === PaymentSendStatus.AlreadyPaid ||
    result.status === PaymentSendStatus.Failure
  ) {
    return reverseApiKeySpendingSettlement()
  }

  return recordApiKeySpendingSettlement(settlementTransactionId)
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

  const { result, settlementTransactionId } = await execute()

  const settleResult = await settleApiKeySpending({
    lock,
    settlement: settlementFor({ result, settlementTransactionId }),
  })
  if (settleResult instanceof Error) {
    recordExceptionInCurrentSpan({ error: settleResult })
  }

  return result
}
