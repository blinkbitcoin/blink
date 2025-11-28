import {
  AmountCalculator,
  BtcPaymentAmount,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
} from "@/domain/shared"

const calc = AmountCalculator()

export const ExemptAccountFeeStrategy = (
  config: ExemptAccountFeeStrategyParams,
): IFeeStrategy => {
  const calculate = async ({
    accountId,
    accountRole,
    previousFee,
    isValidatedMerchant,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    const isExemptAccountId = config.accountIds.includes(accountId)
    const isExemptRole = accountRole && config.roles.includes(accountRole)
    const isExemptMerchant = config.exemptValidatedMerchants && isValidatedMerchant

    if (isExemptAccountId || isExemptRole || isExemptMerchant) {
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
