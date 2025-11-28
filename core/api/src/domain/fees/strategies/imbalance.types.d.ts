type ImbalanceCalculator = {
  getSwapOutImbalanceBtcAmount: <T extends WalletCurrency>(
    wallet: WalletDescriptor<T>,
  ) => Promise<BtcPaymentAmount | LedgerServiceError | ValidationError>
}

type ImbalanceCalculatorArgs = {
  netInVolumeAmountInboundNetworkFn: NewGetVolumeAmountSinceFn
  netInVolumeAmountOutboundNetworkFn: NewGetVolumeAmountSinceFn
  priceRatio: WalletPriceRatio
  sinceDaysAgo: Days
}
