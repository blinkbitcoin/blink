import {
  BtcPaymentAmount,
  AmountCalculator,
  paymentAmountFromNumber,
  ValidationError,
  WalletCurrency,
  BigIntFloatConversionError,
} from "@/domain/shared"

const calc = AmountCalculator()

export const ImbalanceFeeStrategy = (
  config: ImbalanceFeeStrategyParams,
): IFeeStrategy | ValidationError => {
  if (!Number.isInteger(config.ratioAsBasisPoints)) {
    return new ValidationError(
      `Invalid ratioAsBasisPoints for imbalance fee: ${config.ratioAsBasisPoints}`,
    )
  }

  const thresholdAmount = paymentAmountFromNumber({
    amount: config.threshold,
    currency: WalletCurrency.Btc,
  })
  if (thresholdAmount instanceof BigIntFloatConversionError) {
    return new ValidationError(`Invalid threshold for imbalance fee: ${config.threshold}`)
  }
  if (thresholdAmount instanceof Error) return thresholdAmount

  const minFeeAmount = paymentAmountFromNumber({
    amount: config.minFee,
    currency: WalletCurrency.Btc,
  })
  if (minFeeAmount instanceof BigIntFloatConversionError) {
    return new ValidationError(`Invalid minFee for imbalance fee: ${config.minFee}`)
  }
  if (minFeeAmount instanceof Error) return minFeeAmount

  const calculate = ({
    paymentAmount,
    imbalance,
  }: FeeCalculationArgs): BtcPaymentAmount | ValidationError => {
    const zeroAmount = paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    })
    if (zeroAmount instanceof Error) return zeroAmount

    if (!imbalance) {
      return zeroAmount
    }

    const amountWithImbalanceCalcs = calc.sub(
      calc.add(imbalance, paymentAmount),
      thresholdAmount,
    )

    const baseAmount = calc.max(
      calc.min(amountWithImbalanceCalcs, paymentAmount),
      zeroAmount,
    )

    const calculatedFee = calc.mulBasisPoints(
      baseAmount,
      BigInt(config.ratioAsBasisPoints),
    )

    return calc.max(minFeeAmount, calculatedFee)
  }

  return {
    calculate,
  }
}
