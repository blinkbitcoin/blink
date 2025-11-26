import {
  AmountCalculator,
  BtcPaymentAmount,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
} from "@/domain/shared"

const calc = AmountCalculator()

export const InternalAccountFeeStrategy = (
  config: InternalAccountFeeStrategyParams,
): IFeeStrategy => {
  const calculate = async ({
    accountId,
    accountRole,
    previousFee,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    const isExemptAccountId = config.accountIds.includes(accountId)
    const isExemptRole = accountRole && config.roles.includes(accountRole)

    if (isExemptAccountId || isExemptRole) {
      return calc.mul(previousFee.bankFee, -1n)
    }

    const zeroFee = paymentAmountFromNumber({ amount: 0, currency: WalletCurrency.Btc })
    if (zeroFee instanceof Error) return zeroFee

    return zeroFee
  }

  return {
    calculate,
  }
}
