import { BigNumber } from "bignumber.js"

import {
  BtcPaymentAmount,
  ValidationError,
  BigIntFloatConversionError,
  ZERO_SATS,
  safeBigInt,
} from "@/domain/shared"

const MIN_FEE_RATE = 1e-8

const calculateExponentialDecay = ({
  amount,
  minRate,
  maxRate,
  threshold,
  minAmount,
  exponentialFactor,
}: ExponentialDecayArgs): BigNumber => {
  const span = new BigNumber(threshold).minus(minAmount)
  if (span.lte(0)) return new BigNumber(minRate)
  const exponent = amount.minus(minAmount).div(span).negated().times(exponentialFactor)
  return new BigNumber(minRate).plus(
    new BigNumber(maxRate).minus(minRate).times(Math.exp(exponent.toNumber())),
  )
}

const calculateDecayRate = (
  amount: BigNumber,
  config: ExponentialDecayFeeStrategyParams,
): BigNumber => {
  if (amount.isZero()) return new BigNumber(0)

  const { threshold, divisor } = config

  if (amount.lt(threshold)) {
    return calculateExponentialDecay({ ...config, amount })
  }

  return new BigNumber(divisor).div(amount)
}

const calculateNormalizedFactor = ({
  feeRate,
  minNetworkFee,
  maxNetworkFee,
}: NormalizedFactorArgs): BigNumber => {
  const diff = new BigNumber(maxNetworkFee).minus(minNetworkFee)
  if (diff.lte(0)) return new BigNumber(0)
  return new BigNumber(feeRate).minus(minNetworkFee).div(diff)
}

const calculateDynamicFeeRate = ({
  amount,
  feeRate,
  params,
}: DynamicRateArgs): BigNumber => {
  const { targetRate, minNetworkFee, maxNetworkFee } = params

  const decay = calculateDecayRate(amount, params)
  const normalizedFactor = calculateNormalizedFactor({
    feeRate,
    minNetworkFee,
    maxNetworkFee,
  })
  return decay.plus(normalizedFactor.times(new BigNumber(targetRate).minus(decay)))
}

export const calculateBaseMultiplier = ({
  feeRate,
  params,
}: BaseMultiplierArgs): BigNumber => {
  const { offset, factor } = params
  if (Math.abs(feeRate) <= MIN_FEE_RATE) return new BigNumber(offset)
  return new BigNumber(factor).div(feeRate).plus(offset)
}

export const ExponentialDecayStrategy = (
  config: ExponentialDecayFeeStrategyParams,
): IFeeStrategy => {
  const calculate = async ({
    paymentAmount,
    networkFee,
  }: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError> => {
    const satoshisAmount =
      paymentAmount.amount > Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : paymentAmount.amount
    const satoshis = new BigNumber(satoshisAmount)
    const minerFeeAmount =
      networkFee.amount.amount > Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : networkFee.amount.amount
    const minerFeeSats = new BigNumber(minerFeeAmount)
    const currentFeeRate = networkFee.feeRate

    if (satoshis.lte(0) || minerFeeSats.lt(0) || currentFeeRate <= 0) {
      return ZERO_SATS
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

    const rawBankFeeAmount = satoshis
      .times(dynamicRate)
      .plus(minerFeeSats.times(baseMultiplier))
    if (!rawBankFeeAmount.isFinite()) {
      return new ValidationError("Calculated bank fee is not a finite number")
    }

    const bankFeeAmount = rawBankFeeAmount.isNegative()
      ? BigNumber(0)
      : rawBankFeeAmount.integerValue(BigNumber.ROUND_CEIL)
    const bankFee = safeBigInt(bankFeeAmount.toFixed(0))
    if (bankFee instanceof BigIntFloatConversionError) {
      return new ValidationError(
        `Invalid amount for exponential decay fee: ${bankFeeAmount}`,
      )
    }
    if (bankFee instanceof Error) return bankFee

    return BtcPaymentAmount(bankFee)
  }

  return {
    calculate,
  }
}
