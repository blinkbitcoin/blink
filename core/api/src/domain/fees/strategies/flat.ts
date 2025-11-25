import {
  BtcPaymentAmount,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
  BigIntFloatConversionError,
} from "@/domain/shared"

export const FlatFeeStrategy = (config: FlatFeeStrategyParams): IFeeStrategy => {
  const calculate = (): BtcPaymentAmount | ValidationError => {
    const amount = paymentAmountFromNumber({
      amount: config.amount,
      currency: WalletCurrency.Btc,
    })
    if (amount instanceof BigIntFloatConversionError) {
      return new ValidationError(`Invalid amount for flat fee: ${config.amount}`)
    }
    if (amount instanceof Error) return amount

    return amount
  }

  return {
    calculate,
  }
}
