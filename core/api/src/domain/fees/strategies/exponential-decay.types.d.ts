type ExponentialDecayArgs = {
  amount: number
  minRate: number
  maxRate: number
  threshold: number
  minAmount: number
  exponentialFactor: number
}

type NormalizedFactorArgs = {
  feeRate: number
  minNetworkFee: number
  maxNetworkFee: number
}

type DynamicRateArgs = {
  amount: number
  feeRate: number
  params: ExponentialDecayFeeStrategyParams
}

type BaseMultiplierArgs = {
  feeRate: number
  params: ExponentialDecayFeeStrategyParams
}
