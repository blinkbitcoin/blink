import { ONE_DAY } from "@/config"
import { ImbalanceCalculator } from "@/domain/fees/strategies/imbalance"
import { WalletPriceRatio } from "@/domain/payments"
import { BtcPaymentAmount, WalletCurrency, ZERO_SATS } from "@/domain/shared"

const btcWallet: Wallet = {
  id: "walletId" as WalletId,
  type: "checking",
  currency: WalletCurrency.Btc,
  accountId: "a1" as AccountId,
  onChainAddressIdentifiers: [],
  onChainAddresses: () => [],
}

const VolumeAmountAfterLightningReceiptFn = <S extends WalletCurrency>() =>
  Promise.resolve(BtcPaymentAmount(500n) as PaymentAmount<S>)
const VolumeAmountAfterLightningPaymentFn = <S extends WalletCurrency>() =>
  Promise.resolve(BtcPaymentAmount(-600n) as PaymentAmount<S>)
const VolumeAmountAfterOnChainReceiptFn = <S extends WalletCurrency>() =>
  Promise.resolve(BtcPaymentAmount(700n) as PaymentAmount<S>)
const VolumeAmountAfterOnChainPaymentFn = <S extends WalletCurrency>() =>
  Promise.resolve(BtcPaymentAmount(-800n) as PaymentAmount<S>)
const NoVolumeFn = <S extends WalletCurrency>() =>
  Promise.resolve(ZERO_SATS as PaymentAmount<S>)

const priceRatio = WalletPriceRatio({
  usd: { amount: 100_000n, currency: WalletCurrency.Usd },
  btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
})
if (priceRatio instanceof Error) throw priceRatio

describe("ImbalanceCalculator", () => {
  describe("for WithdrawalFeePriceMethod.proportionalOnImbalance", () => {
    it("return positive imbalance when receiving sats on ln", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: VolumeAmountAfterLightningReceiptFn,
        netInVolumeAmountOutboundNetworkFn: NoVolumeFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(500n)
    })
    it("return negative imbalance when sending sats on ln", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: VolumeAmountAfterLightningPaymentFn,
        netInVolumeAmountOutboundNetworkFn: NoVolumeFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(-600n)
    })
    it("return negative imbalance when receiving sats onchain", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: NoVolumeFn,
        netInVolumeAmountOutboundNetworkFn: VolumeAmountAfterOnChainReceiptFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(-700n)
    })
    it("return positive imbalance when sending sats onchain", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: NoVolumeFn,
        netInVolumeAmountOutboundNetworkFn: VolumeAmountAfterOnChainPaymentFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(800n)
    })
    it("swap out increase imbalance", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: VolumeAmountAfterLightningReceiptFn,
        netInVolumeAmountOutboundNetworkFn: VolumeAmountAfterOnChainPaymentFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(800n + 500n)
    })
    it("swap in reduce decrease imbalance", async () => {
      const calculator = ImbalanceCalculator({
        priceRatio,
        sinceDaysAgo: ONE_DAY,
        netInVolumeAmountInboundNetworkFn: VolumeAmountAfterLightningPaymentFn,
        netInVolumeAmountOutboundNetworkFn: VolumeAmountAfterOnChainReceiptFn,
      })
      const imbalance = await calculator.getSwapOutImbalanceBtcAmount(btcWallet)
      if (imbalance instanceof Error) throw imbalance
      expect(imbalance.amount).toBe(-700n - 600n)
    })
  })
})
