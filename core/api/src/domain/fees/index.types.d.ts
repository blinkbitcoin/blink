type NetworkFee = {
  amount: BtcPaymentAmount
  feeRate?: number
}

type FeeCalculationArgs = {
  paymentAmount: BtcPaymentAmount
  account: Account
  wallet: Wallet
  networkFee: NetworkFee
  previousFee: BtcPaymentAmount
  imbalance?: BtcPaymentAmount
}

interface IFeeStrategy {
  calculate(args: FeeCalculationArgs): BtcPaymentAmount | ValidationError
}

type CalculateCompositeFeeArgs = Omit<FeeCalculationArgs, "previousFee"> & {
  strategies: FeeStrategy[]
}
