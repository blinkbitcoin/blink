import {
  IntraledgerLimitsExceededError,
  TradeIntraAccountLimitsExceededError,
  WithdrawalLimitsExceededError,
} from "@/domain/errors"
import { centsToDollars } from "@/domain/fiat"
import { addAttributesToCurrentSpan } from "@/services/tracing"

export const AccountTxVolumeLimitChecker = (
  accountLimits: IAccountLimits,
): IAccountTxVolumeLimitChecker => {
  const checkIntraledger = async ({
    amount,
    volumeRemaining,
  }: {
    amount: UsdPaymentAmount
    volumeRemaining: UsdPaymentAmount
  }) => {
    addAttributesToCurrentSpan({
      "txLimit.volumeRemainingInUsd": `${volumeRemaining.amount}`,
      "txLimit.amountToCheckInUsd": `${amount.amount}`,
    })

    const limitAsUsd = `$${centsToDollars(accountLimits.intraLedgerLimit).toFixed(2)}`
    const limitErrMsg = `Cannot transfer more than ${limitAsUsd} in 24 hours`

    return volumeRemaining.amount >= amount.amount
      ? true
      : new IntraledgerLimitsExceededError(limitErrMsg)
  }

  const checkWithdrawal = async ({
    amount,
    volumeRemaining,
  }: {
    amount: UsdPaymentAmount
    volumeRemaining: UsdPaymentAmount
  }) => {
    addAttributesToCurrentSpan({
      "txLimit.volumeRemainingInUsd": `${volumeRemaining.amount}`,
      "txLimit.amountToCheckInUsd": `${amount.amount}`,
    })

    const limitAsUsd = `$${centsToDollars(accountLimits.withdrawalLimit).toFixed(2)}`
    const limitErrMsg = `Cannot transfer more than ${limitAsUsd} in 24 hours`

    return volumeRemaining.amount >= amount.amount
      ? true
      : new WithdrawalLimitsExceededError(limitErrMsg)
  }

  const checkTradeIntraAccount = async ({
    amount,
    volumeRemaining,
  }: {
    amount: UsdPaymentAmount
    volumeRemaining: UsdPaymentAmount
  }) => {
    addAttributesToCurrentSpan({
      "txLimit.volumeRemainingInUsd": `${volumeRemaining.amount}`,
      "txLimit.amountToCheckInUsd": `${amount.amount}`,
    })

    const limitAsUsd = `$${centsToDollars(accountLimits.tradeIntraAccountLimit).toFixed(2)}`
    const limitErrMsg = `Cannot transfer more than ${limitAsUsd} in 24 hours`

    return volumeRemaining.amount >= amount.amount
      ? true
      : new TradeIntraAccountLimitsExceededError(limitErrMsg)
  }

  return {
    checkIntraledger,
    checkWithdrawal,
    checkTradeIntraAccount,
  }
}
