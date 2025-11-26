import { ImbalanceFeeStrategy } from "@/domain/fees/strategies/imbalance"
import { WalletPriceRatio } from "@/domain/payments"
import {
  paymentAmountFromNumber,
  BtcPaymentAmount,
  WalletCurrency,
  ValidationError,
} from "@/domain/shared"

const mockNetInVolumeAmountInboundNetworkFn = jest.fn()
const mockNetInVolumeAmountOutboundNetworkFn = jest.fn()

beforeEach(() => {
  mockNetInVolumeAmountInboundNetworkFn.mockReset()
  mockNetInVolumeAmountOutboundNetworkFn.mockReset()
})

describe("ImbalanceFeeStrategy", () => {
  const config = {
    threshold: 1_000_000,
    ratioAsBasisPoints: 50, // 0.5%
    daysLookback: 30 as Days,
    minFee: 2000,
  }

  const paymentAmount = paymentAmountFromNumber({
    amount: 500_000,
    currency: WalletCurrency.Btc,
  }) as BtcPaymentAmount

  const priceRatio = WalletPriceRatio({
    usd: { amount: 100_000n, currency: WalletCurrency.Usd },
    btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
  })
  if (priceRatio instanceof Error) throw priceRatio

  const wallet: Wallet = {
    id: "wallet-id" as WalletId,
    accountId: "account-id" as AccountId,
    currency: WalletCurrency.Btc,
    onChainAddressIdentifiers: [],
    type: "checking",
    onChainAddresses: () => [],
  }

  const createImbalanceFns = (
    inboundSats: bigint,
    outboundSats: bigint,
  ): ImbalanceFns => {
    mockNetInVolumeAmountInboundNetworkFn.mockResolvedValueOnce({
      amount: inboundSats,
      currency: WalletCurrency.Btc,
    })
    mockNetInVolumeAmountOutboundNetworkFn.mockResolvedValueOnce({
      amount: outboundSats,
      currency: WalletCurrency.Btc,
    })

    return {
      netInVolumeAmountInboundNetworkFn: mockNetInVolumeAmountInboundNetworkFn,
      netInVolumeAmountOutboundNetworkFn: mockNetInVolumeAmountOutboundNetworkFn,
      priceRatio,
    }
  }

  describe("configuration validation", () => {
    it("rejects non-integer ratioAsBasisPoints", () => {
      const strategy = ImbalanceFeeStrategy({ ...config, ratioAsBasisPoints: 50.5 })
      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("rejects non-integer threshold", () => {
      const strategy = ImbalanceFeeStrategy({ ...config, threshold: 1_000_000.5 })
      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("rejects non-integer minFee", () => {
      const strategy = ImbalanceFeeStrategy({ ...config, minFee: 2000.5 })
      expect(strategy).toBeInstanceOf(ValidationError)
    })
  })

  describe("calculate", () => {
    it("returns zero fee when no imbalanceFns provided", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        paymentAmount,
        wallet,
      } as unknown as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(0n)
    })

    it("returns error when volume fn fails", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      mockNetInVolumeAmountInboundNetworkFn.mockResolvedValueOnce(
        new Error("network error"),
      )

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(0n, 0n),
      })

      expect(fee).toBeInstanceOf(Error)
    })

    it("returns minFee when imbalance is below threshold", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(900_000n, 0n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2000n)
    })

    it("calculates fee correctly when imbalance exceeds threshold", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(2_000_000n, 0n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2500n)
    })

    it("caps fee at paymentAmount", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(10_000_000n, 0n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2500n)
    })

    it("returns minFee for negative imbalance", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(0n, 1_000_000n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2000n)
    })

    it("handles zero imbalance", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(500_000n, 500_000n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2000n)
    })

    it("applies minFee when calculated fee is lower", async () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        accountId: "" as AccountId,
        networkFee: {} as NetworkFee,
        previousFee: {} as FeeDetails,
        paymentAmount,
        wallet,
        imbalanceFns: createImbalanceFns(1_100_000n, 0n),
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(2500n)
    })
  })
})
