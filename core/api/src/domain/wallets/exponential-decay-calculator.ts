import { WalletCurrency, ZERO_SATS } from "@/domain/shared"

export const OnChainExpDecayFees = ({
  exponentialDecayConfig,
  payoutQueueConfig,
}: OnchainExpDecayConfig): OnChainFeeExpDecayCalculator => {
  const expDecayFee = ({
    amount,
    speed,
    feeRate,
    minerFee,
  }: {
    amount: BtcPaymentAmount
    minerFee: BtcPaymentAmount
    speed: PayoutSpeed
    feeRate: number
  }) => {
    const satoshis = Number(amount.amount)
    const minerCost = Number(minerFee.amount)

    if (feeRate <= 0) {
      return {
        totalFee: ZERO_SATS,
        bankFee: ZERO_SATS,
      }
    }

    const dynamicRate = calculateDynamicFeeRate({ amount: satoshis, speed, feeRate })
    const baseMultiplier = calculateBaseMultiplier({ speed, feeRate })
    const bankFee: BtcPaymentAmount = {
      amount: BigInt(Math.round(satoshis * dynamicRate + minerCost * baseMultiplier)),
      currency: WalletCurrency.Btc,
    }

    return {
      totalFee: bankFee,
      bankFee,
    }
  }

  const calculateExponentialDecay = (args: ExponentialDecayArgs): number => {
    const { amount, minRate, maxRate, threshold, minAmount, exponentialFactor } = args
    const span = threshold - minAmount
    const exponent = -((amount - minAmount) / span) * exponentialFactor
    return minRate + (maxRate - minRate) * Math.exp(exponent)
  }

  const calculateDecayRate: DecayRateCalculator = (amount, params) => {
    const { threshold, minSats, exponentialFactor } = exponentialDecayConfig
    const { minRate, maxRate, divisor } = params

    if (amount < threshold) {
      return calculateExponentialDecay({
        amount,
        minRate,
        maxRate,
        threshold,
        minAmount: minSats,
        exponentialFactor,
      })
    }

    return divisor / amount
  }

  const calculateNormalizedFactor = (args: NormalizedFactorArgs): number => {
    const { feeRate } = args
    const { min, max } = exponentialDecayConfig.networkFeeRange
    return (feeRate - min) / (max - min)
  }

  const getQueueConfigBySpeed = (speed: PayoutSpeed) => {
    const queueConfig = payoutQueueConfig.find((queue) => queue.speed === speed)!
    return queueConfig.feeMethodConfig.exponentialDecay
  }

  const calculateDynamicFeeRate: DynamicRateCalculator = (args: DynamicRateArgs) => {
    const { amount, speed, feeRate } = args
    const { targetRate, ...decayParams } = getQueueConfigBySpeed(speed)
    const decay = calculateDecayRate(amount, decayParams)
    const normalizedFactor = calculateNormalizedFactor({ feeRate })
    return decay + normalizedFactor * (targetRate - decay)
  }

  const calculateBaseMultiplier: BaseMultiplierCalculator = (
    args: BaseMultiplierArgs,
  ) => {
    const { speed, feeRate } = args
    const { offset, factor } = getQueueConfigBySpeed(speed)
    return factor / feeRate + offset
  }

  return {
    expDecayFee,
    calculateBaseMultiplier,
  }
}
