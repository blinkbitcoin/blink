import {
  BtcPaymentAmount,
  WalletCurrency,
  paymentAmountFromNumber,
  ValidationError,
  BigIntFloatConversionError,
} from "@/domain/shared"

const MIN_FEE_RATE = 1e-8

const calculateExponentialDecay = ({
  amount,
  minRate,
  maxRate,
  threshold,
  minAmount,
  exponentialFactor,
}: ExponentialDecayArgs): number => {
  const span = threshold - minAmount
  if (span <= 0) return minRate
  const exponent = -((amount - minAmount) / span) * exponentialFactor
  return minRate + (maxRate - minRate) * Math.exp(exponent)
}

const calculateDecayRate = (
  amount: number,
  config: ExponentialDecayFeeStrategyParams,
): number => {
  if (amount === 0) return 0

  const { threshold, divisor } = config

  if (amount < threshold) {
    return calculateExponentialDecay({ ...config, amount })
  }

  return divisor / amount
}

const calculateNormalizedFactor = ({
  feeRate,
  minNetworkFee,
  maxNetworkFee,
}: NormalizedFactorArgs): number => {
  if (maxNetworkFee - minNetworkFee <= 0) return 0
  return (feeRate - minNetworkFee) / (maxNetworkFee - minNetworkFee)
}

const calculateDynamicFeeRate = ({
  amount,
  feeRate,
  params,
}: DynamicRateArgs): number => {
  const { targetRate, minNetworkFee, maxNetworkFee } = params

  const decay = calculateDecayRate(amount, params)
  const normalizedFactor = calculateNormalizedFactor({
    feeRate,
    minNetworkFee,
    maxNetworkFee,
  })
  return decay + normalizedFactor * (targetRate - decay)
}

export const calculateBaseMultiplier = ({
  feeRate,
  params,
}: BaseMultiplierArgs): number => {
  const { offset, factor } = params
  if (Math.abs(feeRate) <= MIN_FEE_RATE) return offset
  return factor / feeRate + offset
}

export const ExponentialDecayStrategy = (
  config: ExponentialDecayFeeStrategyParams,
): IFeeStrategy => {
  const calculate = async ({
    paymentAmount,
    networkFee,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    const satoshis = Number(paymentAmount.amount)
    const minerFeeSats = Number(networkFee.amount.amount)
    const currentFeeRate = networkFee.feeRate

    if (satoshis <= 0 || minerFeeSats < 0 || currentFeeRate <= 0) {
      return paymentAmountFromNumber({
        amount: 0,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount
    }

    const dynamicRate = calculateDynamicFeeRate({
      amount: satoshis,
      feeRate: currentFeeRate,
      params: config,
    })

    const baseMultiplier = calculateBaseMultiplier({
      feeRate: currentFeeRate,
      params: config,
    })

    const bankFeeAmount = Math.ceil(
      satoshis * dynamicRate + minerFeeSats * baseMultiplier,
    )

    if (bankFeeAmount < 0) {
      return new ValidationError("Calculated bank fee is negative")
    }

    const totalFee = paymentAmountFromNumber({
      amount: bankFeeAmount,
      currency: WalletCurrency.Btc,
    })
    if (totalFee instanceof BigIntFloatConversionError) {
      return new ValidationError(
        `Invalid amount for exponential decay fee: ${bankFeeAmount}`,
      )
    }
    if (totalFee instanceof Error) return totalFee

    return totalFee
  }

  return {
    calculate,
  }
}
