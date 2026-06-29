import { PercentageAboveThresholdFeeStrategy } from "@/domain/fees/strategies/percentage-above-threshold"
import { WalletPriceRatio } from "@/domain/payments"
import {
  AmountCalculator,
  BtcPaymentAmount,
  WalletCurrency,
  ValidationError,
  paymentAmountFromNumber,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("PercentageAboveThresholdFeeStrategy", () => {
  const wallet: Wallet = {
    id: "wallet-id" as WalletId,
    accountId: "account-id" as AccountId,
    currency: WalletCurrency.Btc,
    onChainAddressIdentifiers: [],
    type: "checking",
    onChainAddresses: () => [],
  }

  const btcAmount = (amount: number): BtcPaymentAmount =>
    paymentAmountFromNumber({
      amount,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount

  const priceRatioAtCentsPerSat = (centsPerSat: number): WalletPriceRatio => {
    const ratio = WalletPriceRatio({
      usd: { amount: BigInt(centsPerSat) * 100_000_000n, currency: WalletCurrency.Usd },
      btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
    })
    if (ratio instanceof Error) throw ratio
    return ratio
  }

  const calculate = async ({
    config,
    paymentAmount,
    priceRatio,
  }: {
    config: PercentageAboveThresholdFeeStrategyParams
    paymentAmount: BtcPaymentAmount
    priceRatio?: WalletPriceRatio
  }) => {
    const strategy = PercentageAboveThresholdFeeStrategy(config)
    if (strategy instanceof Error) throw strategy

    return strategy.calculate({
      accountId: "" as AccountId,
      networkFee: {} as NetworkFee,
      previousFee: {} as FeeDetails,
      paymentAmount,
      wallet,
      priceRatio,
    })
  }

  describe("configuration validation", () => {
    it("rejects non-integer basisPoints", () => {
      const strategy = PercentageAboveThresholdFeeStrategy({
        basisPoints: 30.5,
        thresholdInCents: 10_000,
      })
      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("rejects non-integer thresholdInCents", () => {
      const strategy = PercentageAboveThresholdFeeStrategy({
        basisPoints: 30,
        thresholdInCents: 10_000.5,
      })
      expect(strategy).toBeInstanceOf(ValidationError)
    })
  })

  describe("calculate", () => {
    it("charges a percentage of the full amount when above the threshold", async () => {
      const config: PercentageAboveThresholdFeeStrategyParams = {
        basisPoints: 30,
        thresholdInCents: 10_000,
      }
      const priceRatio = priceRatioAtCentsPerSat(1)
      const paymentAmount = btcAmount(20_000)
      const fee = await calculate({ config, paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee

      const expectedFee = calc.mulBasisPoints(paymentAmount, 30n)
      expect(fee).toEqual(expectedFee)
    })

    it("charges no fee at exactly the threshold", async () => {
      const config: PercentageAboveThresholdFeeStrategyParams = {
        basisPoints: 30,
        thresholdInCents: 10_000,
      }
      const priceRatio = priceRatioAtCentsPerSat(1)
      const paymentAmount = btcAmount(10_000)
      const fee = await calculate({ config, paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(0n)
    })

    it("charges no fee below the threshold", async () => {
      const config: PercentageAboveThresholdFeeStrategyParams = {
        basisPoints: 30,
        thresholdInCents: 10_000,
      }
      const priceRatio = priceRatioAtCentsPerSat(1)
      const paymentAmount = btcAmount(5_000) // $50.00
      const fee = await calculate({ config, paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(0n)
    })

    it("compares the threshold in USD, a higher price ratio flips a sub-gate sat amount to charged", async () => {
      const config: PercentageAboveThresholdFeeStrategyParams = {
        basisPoints: 30,
        thresholdInCents: 10_000,
      }
      const paymentAmount = btcAmount(8_000)

      const feeAtLower = await calculate({
        config,
        paymentAmount,
        priceRatio: priceRatioAtCentsPerSat(1),
      })
      expect(feeAtLower).not.toBeInstanceOf(Error)
      if (feeAtLower instanceof Error) throw feeAtLower
      expect(feeAtLower.amount).toBe(0n)

      const feeAtHigher = await calculate({
        config,
        paymentAmount,
        priceRatio: priceRatioAtCentsPerSat(2),
      })
      expect(feeAtHigher).not.toBeInstanceOf(Error)
      if (feeAtHigher instanceof Error) throw feeAtHigher
      expect(feeAtHigher).toEqual(calc.mulBasisPoints(paymentAmount, 30n))
    })

    it("fails closed with a ValidationError when no price ratio is available", async () => {
      const config: PercentageAboveThresholdFeeStrategyParams = {
        basisPoints: 30,
        thresholdInCents: 10_000,
      }
      const paymentAmount = btcAmount(20_000)
      const fee = await calculate({ config, paymentAmount, priceRatio: undefined })

      expect(fee).toBeInstanceOf(ValidationError)
    })
  })
})
