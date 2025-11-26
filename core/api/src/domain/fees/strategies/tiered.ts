import {
  BtcPaymentAmount,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
  BigIntFloatConversionError,
} from "@/domain/shared"

export const TieredFeeStrategy = (
  config: TieredFlatFeeStrategyParams,
): IFeeStrategy | ValidationError => {
  const sortedTiers = [...config.tiers].sort((a, b) => {
    const maxA = a.maxAmount === null ? Infinity : a.maxAmount
    const maxB = b.maxAmount === null ? Infinity : b.maxAmount
    return maxA - maxB
  })

  const nullTiersCount = sortedTiers.filter((tier) => tier.maxAmount === null).length
  if (nullTiersCount > 1) {
    return new ValidationError(
      "Invalid tiered fee configuration: Only one tier can have 'maxAmount: null'.",
    )
  }

  const calculate = async ({
    paymentAmount,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    for (const tier of sortedTiers) {
      if (tier.maxAmount === null || paymentAmount.amount <= BigInt(tier.maxAmount)) {
        const amount = paymentAmountFromNumber({
          amount: tier.amount,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof BigIntFloatConversionError) {
          return new ValidationError(`Invalid amount for tiered fee: ${tier.amount}`)
        }
        if (amount instanceof Error) return amount
        return amount
      }
    }

    const zeroAmount = paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    })
    if (zeroAmount instanceof Error) return zeroAmount
    return zeroAmount
  }

  return {
    calculate,
  }
}
