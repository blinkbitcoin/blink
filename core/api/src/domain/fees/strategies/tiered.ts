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
  // Defensive copy and sort the tiers
  const sortedTiers = [...config.tiers].sort((a, b) => {
    // Treat null as infinity for sorting purposes
    const maxA = a.maxAmount === null ? Infinity : a.maxAmount
    const maxB = b.maxAmount === null ? Infinity : b.maxAmount
    return maxA - maxB
  })

  // New defensive check: Only one tier can have 'maxAmount: null'
  const nullTiersCount = sortedTiers.filter((tier) => tier.maxAmount === null).length
  if (nullTiersCount > 1) {
    return new ValidationError(
      "Invalid tiered fee configuration: Only one tier can have 'maxAmount: null'.",
    )
  }

  const calculate = ({
    paymentAmount,
  }: FeeCalculationArgs): BtcPaymentAmount | ValidationError => {
    for (const tier of sortedTiers) {
      // Use the sorted tiers
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

    // Fallback if no tier matches (should ideally not happen with a catch-all tier with maxAmount: null)
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
