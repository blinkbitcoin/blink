import {
  BtcPaymentAmount,
  AmountCalculator,
  ValidationError,
  ZERO_SATS,
} from "@/domain/shared"

const calc = AmountCalculator()

export const PercentageAboveThresholdFeeStrategy = (
  config: PercentageAboveThresholdFeeStrategyParams,
): IFeeStrategy | ValidationError => {
  if (!Number.isInteger(config.basisPoints)) {
    return new ValidationError(
      `Invalid basisPoints for percentageAboveThreshold fee: ${config.basisPoints}`,
    )
  }

  if (!Number.isInteger(config.thresholdInCents)) {
    return new ValidationError(
      `Invalid thresholdInCents for percentageAboveThreshold fee: ${config.thresholdInCents}`,
    )
  }

  const calculate = async ({
    paymentAmount,
    priceRatio,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    if (!priceRatio) {
      return new ValidationError(
        "Price ratio required to evaluate percentageAboveThreshold fee",
      )
    }

    const amountInCents = priceRatio.convertFromBtcToFloor(paymentAmount)
    if (amountInCents.amount <= BigInt(config.thresholdInCents)) {
      return ZERO_SATS
    }

    return calc.mulBasisPoints(paymentAmount, BigInt(config.basisPoints))
  }

  return {
    calculate,
  }
}
