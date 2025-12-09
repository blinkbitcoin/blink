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
  decayStartAmount,
  baseAmount,
  decaySpeed,
}: ExponentialDecayArgs): BigNumber => {
  const span = new BigNumber(decayStartAmount).minus(baseAmount)
  if (span.lte(0)) return new BigNumber(minRate)
  const exponent = amount.minus(baseAmount).div(span).negated().times(decaySpeed)
  return new BigNumber(minRate).plus(
    new BigNumber(maxRate).minus(minRate).times(Math.exp(exponent.toNumber())),
  )
}

const calculateDecayRate = (
  amount: BigNumber,
  config: ExponentialDecayFeeStrategyParams,
): BigNumber => {
  if (amount.isZero()) return new BigNumber(0)

  const { decayStartAmount, terminalDivisor } = config

  if (amount.lt(decayStartAmount)) {
    return calculateExponentialDecay({ ...config, amount })
  }

  return new BigNumber(terminalDivisor).div(amount)
}

const calculateNormalizedFactor = ({
  feeRate,
  minFeeRate,
  maxFeeRate,
}: NormalizedFactorArgs): BigNumber => {
  const diff = new BigNumber(maxFeeRate).minus(minFeeRate)
  if (diff.lte(0)) return new BigNumber(0)
  return new BigNumber(feeRate).minus(minFeeRate).div(diff)
}

const calculateDynamicFeeRate = ({
  amount,
  feeRate,
  params,
}: DynamicRateArgs): BigNumber => {
  const { targetFeeRate, minFeeRate, maxFeeRate } = params

  const decay = calculateDecayRate(amount, params)
  const normalizedFactor = calculateNormalizedFactor({
    feeRate,
    minFeeRate,
    maxFeeRate,
  })
  return decay.plus(normalizedFactor.times(new BigNumber(targetFeeRate).minus(decay)))
}

export const calculateBaseMultiplier = ({
  feeRate,
  params,
}: BaseMultiplierArgs): BigNumber => {
  const { networkFeeOffset, networkFeeFactor } = params
  if (Math.abs(feeRate) <= MIN_FEE_RATE) return new BigNumber(networkFeeOffset)
  return new BigNumber(networkFeeFactor).div(feeRate).plus(networkFeeOffset)
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
      // this is necessary because calculateCompositeFee adds network fee to bank fee
      .minus(minerFeeSats)
    if (!rawBankFeeAmount.isFinite()) {
      return new ValidationError("Calculated bank fee is not a finite number")
    }

    const bankFeeAmount = rawBankFeeAmount.isNegative()
      ? new BigNumber(0)
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
