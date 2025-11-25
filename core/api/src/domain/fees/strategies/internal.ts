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
  const calculate = ({
    account,
    previousFee,
  }: FeeCalculationArgs): BtcPaymentAmount | ValidationError => {
    const isExemptAccountId = config.accountIds.includes(account.id)
    const isExemptRole = account.role && config.roles.includes(account.role)

    if (isExemptAccountId || isExemptRole) {
      return calc.mul(previousFee, -1n)
    }

    const zeroFee = paymentAmountFromNumber({ amount: 0, currency: WalletCurrency.Btc })
    if (zeroFee instanceof Error) return zeroFee

    return zeroFee
  }

  return {
    calculate,
  }
}
