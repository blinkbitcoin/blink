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
    imbalanceFns,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    // Fail closed: the threshold is evaluated in USD, so without a price ratio
    // we cannot know whether the payment is above the threshold.
    const priceRatio = imbalanceFns?.priceRatio
    if (!priceRatio) {
      return new ValidationError(
        "Price ratio required to evaluate percentageAboveThreshold fee",
      )
    }

    // Floor so that an amount converting to exactly `thresholdInCents` does not
    // tip over the strictly-above gate.
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
