import { PayoutSpeed } from "@/domain/bitcoin/onchain"
import { WalletCurrency, ZERO_SATS } from "@/domain/shared"

export const OnChainExpDecayFees = ({
  onchain,
}: OnchainExpDecayConfig): OnChainFeeExpDecayCalculator => {
  const expDecayFee = ({
    amount,
    speed,
    feeRate,
  }: {
    amount: BtcPaymentAmount
    speed: PayoutSpeed
    feeRate: number
  }) => {
    const satoshis = Number(amount.amount)

    if (feeRate <= 0) {
      return {
        totalFee: ZERO_SATS,
        bankFee: ZERO_SATS,
      }
    }

    const dynamicRate = calculateDynamicFeeRate(satoshis, speed, feeRate)
    const baseMultiplier = calculateBaseMultiplier(speed, feeRate)
    const bankCost = calculateCostToBank(satoshis, speed, feeRate)

    const bankFee: BtcPaymentAmount = {
      amount: BigInt(Math.round(satoshis * dynamicRate + bankCost * baseMultiplier)),
      currency: WalletCurrency.Btc,
    }

    return {
      totalFee: bankFee,
      bankFee,
    }
  }

  const createThresholdBasedCalculator =
    (
      thresholds: readonly { max: number; count: number }[],
      defaultCount: number,
    ): InputCountCalculator =>
    (amount: number) => {
      const threshold = thresholds.find(({ max }) => amount < max)
      return threshold?.count ?? defaultCount
    }

  const calculateRegularInputCount: InputCountCalculator = createThresholdBasedCalculator(
    onchain.thresholds.regular,
    onchain.thresholds.defaults.regular,
  )

  const calculateBatchInputCount: InputCountCalculator = createThresholdBasedCalculator(
    onchain.thresholds.batch,
    onchain.thresholds.defaults.batch,
  )

  const calculateTransactionSizeSpec: TransactionSizeCalculator = (spec) => {
    const { baseSize, inputSize, outputSize } = onchain.transaction
    return baseSize + spec.inputCount * inputSize + spec.outputCount * outputSize
  }

  const calculateTransactionSize = (inputCount: number, outputCount: number): number =>
    calculateTransactionSizeSpec({ inputCount, outputCount })

  const calculateExponentialDecay = (
    amount: number,
    minRate: number,
    maxRate: number,
    threshold: number,
    minAmount: number,
    exponentialFactor: number,
  ): number => {
    const span = threshold - minAmount
    const exponent = -((amount - minAmount) / span) * exponentialFactor
    return minRate + (maxRate - minRate) * Math.exp(exponent)
  }

  const calculateDecayRate: DecayRateCalculator = (amount, params) => {
    const { threshold, minSats, exponentialFactor } = onchain.decayConstants
    const { minRate, maxRate, divisor } = params

    if (amount < threshold) {
      return calculateExponentialDecay(
        amount,
        minRate,
        maxRate,
        threshold,
        minSats,
        exponentialFactor,
      )
    }

    return divisor / amount
  }

  const calculateNormalizedFactor = (feeRate: number): number => {
    const { min, max } = onchain.decayConstants.networkFeeRange
    return (feeRate - min) / (max - min)
  }

  const calculateDynamicFeeRate: DynamicRateCalculator = (amount, speed, feeRate) => {
    const { targetRate, ...decayParams } = onchain.decay[speed]
    const decay = calculateDecayRate(amount, decayParams)
    const normalizedFactor = calculateNormalizedFactor(feeRate)
    return decay + normalizedFactor * (targetRate - decay)
  }

  const calculateBaseMultiplier: BaseMultiplierCalculator = (speed, feeRate) => {
    const { factors, offsets } = onchain.multiplier
    return factors[speed] / feeRate + offsets[speed]
  }

  const createTransactionSpec = (
    amount: number,
    speed: PayoutSpeed,
  ): TransactionSpecification => {
    const { outputs } = onchain.transaction

    if (speed === PayoutSpeed.Slow) {
      return {
        inputCount: calculateBatchInputCount(amount),
        outputCount: outputs.batch,
      }
    }

    return {
      inputCount: calculateRegularInputCount(amount),
      outputCount: outputs.regular,
    }
  }

  const calculateCostToBank: CostToBankCalculator = (amount, speed, feeRate) => {
    const spec = createTransactionSpec(amount, speed)
    const size = calculateTransactionSizeSpec(spec)

    return speed === PayoutSpeed.Slow ? Math.round((size * feeRate) / 10) : size * feeRate
  }

  return {
    expDecayFee,
    calculateCostToBank,
    calculateBaseMultiplier,
    calculateTransactionSize,
  }
}
