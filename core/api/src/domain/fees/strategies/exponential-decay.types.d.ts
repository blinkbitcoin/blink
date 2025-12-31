type ExponentialDecayArgs = {
  amount: BigNumber
  minRate: number
  maxRate: number
  decayStartAmount: number
  baseAmount: number
  decaySpeed: number
}

type NormalizedFactorArgs = {
  feeRate: number
  minFeeRate: number
  maxFeeRate: number
}

type DynamicRateArgs = {
  amount: BigNumber
  feeRate: number
  params: ExponentialDecayFeeStrategyParams
}

type BaseMultiplierArgs = {
  feeRate: number
  params: ExponentialDecayFeeStrategyParams
}
