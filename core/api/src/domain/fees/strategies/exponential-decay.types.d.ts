type ExponentialDecayArgs = {
  amount: BigNumber
  minRate: number
  maxRate: number
  threshold: number
  minAmount: number
  exponentialFactor: number
}

type NormalizedFactorArgs = {
  feeRate: number
  minNetworkFeeRate: number
  maxNetworkFeeRate: number
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
