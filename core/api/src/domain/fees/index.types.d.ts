type NetworkFee = {
  amount: BtcPaymentAmount
  feeRate: number
}

type ImbalanceFns = {
  netInVolumeAmountInboundNetworkFn: NewGetVolumeAmountSinceFn
  netInVolumeAmountOutboundNetworkFn: NewGetVolumeAmountSinceFn
  priceRatio: WalletPriceRatio
}

type FeeCalculationArgs = {
  paymentAmount: BtcPaymentAmount
  accountId: AccountId
  accountRole?: string
  wallet: WalletDescriptor<"BTC"> | WalletDescriptor<"USD">
  networkFee: NetworkFee
  previousFee: FeeDetails
  imbalanceFns?: ImbalanceFns
  isValidatedMerchant?: boolean
}

interface IFeeStrategy {
  calculate(args: FeeCalculationArgs): Promise<BtcPaymentAmount | ValidationError>
}

type CalculateCompositeFeeArgs = Omit<FeeCalculationArgs, "previousFee"> & {
  strategies: FeeStrategy[]
}

type OnChainDepositFeeArgs = Omit<
  FeeCalculationArgs,
  "previousFee" | "networkFee" | "imbalance"
>
type LightningDepositFeeArgs = Omit<
  FeeCalculationArgs,
  "previousFee" | "networkFee" | "imbalance"
>
type IntraledgerDepositFeeArgs = Omit<
  FeeCalculationArgs,
  "previousFee" | "networkFee" | "imbalance"
>

type DepositFeeCalculator = {
  onChainFee(args: OnChainDepositFeeArgs): Promise<FeeDetails | ValidationError>
  lightningFee(args: LightningDepositFeeArgs): Promise<FeeDetails | ValidationError>
  intraledgerFee(args: IntraledgerDepositFeeArgs): Promise<FeeDetails | ValidationError>
}

type OnChainWithdrawalFeeArgs = Omit<FeeCalculationArgs, "previousFee"> & {
  speed: PayoutSpeed
}
type LightningWithdrawalFeeArgs = Omit<FeeCalculationArgs, "previousFee">
type IntraledgerWithdrawalFeeArgs = Omit<FeeCalculationArgs, "previousFee" | "networkFee">

type FeeDetails = {
  totalFee: BtcPaymentAmount
  bankFee: BtcPaymentAmount
  minerFee: BtcPaymentAmount
}

type WithdrawalFeeResult = FeeDetails

type WithdrawalFeeCalculator = {
  onChainFee(
    args: OnChainWithdrawalFeeArgs,
  ): Promise<WithdrawalFeeResult | ValidationError>
  lightningFee(
    args: LightningWithdrawalFeeArgs,
  ): Promise<WithdrawalFeeResult | ValidationError>
  intraledgerFee(
    args: IntraledgerWithdrawalFeeArgs,
  ): Promise<WithdrawalFeeResult | ValidationError>
}
