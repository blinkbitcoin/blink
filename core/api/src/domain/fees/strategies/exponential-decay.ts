/**
 * Exponential Decay Fee Strategy
 *
 * This strategy implements an exponential decay fee calculation for onchain payments,
 * designed to encourage larger transactions by reducing fees as payment amounts increase.
 *
 * Algorithm Overview:
 * - For amounts below `decayStartAmount`, fees decay exponentially from `maxRate` to `minRate`.
 * - For amounts above `decayStartAmount`, fees follow a linear decay: `terminalDivisor / amount`.
 * - The final fee is adjusted by a dynamic rate (combining decay and normalized network fee factor)
 *   multiplied by the payment amount, plus a base multiplier applied to the network fee.
 *
 * Configuration Parameters:
 * - `decayStartAmount`: Threshold above which linear decay begins.
 * - `baseAmount`: Base amount for exponential decay calculation.
 * - `decaySpeed`: Speed of exponential decay (higher values decay faster, previously `exponentialFactor`).
 * - `minFeeRate`/`maxFeeRate`: Min/max fee rates for normalization.
 * - `minRate`/`maxRate`: Min/max rates for exponential decay.
 * - `terminalDivisor`: Divisor for linear decay above threshold.
 * - `targetFeeRate`: Target fee rate for dynamic adjustment.
 * - `networkFeeOffset`/`networkFeeFactor`: Offset and factor for base multiplier on network fees.
 *
 * Mathematical Model:
 * 1. Exponential Decay: rate = minRate + (maxRate - minRate) * exp(-decaySpeed * ((amount - baseAmount) / (decayStartAmount - baseAmount)))
 * 2. Linear Decay: rate = terminalDivisor / amount
 * 3. Dynamic Rate: decay + normalizedFactor * (targetFeeRate - decay)
 * 4. Base Multiplier: networkFeeFactor / feeRate + networkFeeOffset (if feeRate > MIN_FEE_RATE, else networkFeeOffset)
 * 5. Final Fee: ceil(amount * dynamicRate + networkFee * baseMultiplier) - networkFee
 *
 * References:
 * - Original implementation: https://github.com/pretyflaco/BlinkFeeCalculator
 */

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
