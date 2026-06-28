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
  const config: PercentageAboveThresholdFeeStrategyParams = {
    basisPoints: 30, // 0.3%
    thresholdInCents: 10_000, // $100.00
  }

  const wallet: Wallet = {
    id: "wallet-id" as WalletId,
    accountId: "account-id" as AccountId,
    currency: WalletCurrency.Btc,
    onChainAddressIdentifiers: [],
    type: "checking",
    onChainAddresses: () => [],
  }

  // 1 cent per sat: convertFromBtcToFloor(N sats) === N cents
  const priceRatio = WalletPriceRatio({
    usd: { amount: 100_000_000n, currency: WalletCurrency.Usd },
    btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
  })
  if (priceRatio instanceof Error) throw priceRatio

  // 2 cents per sat: doubles the USD value of the same sat amount
  const higherPriceRatio = WalletPriceRatio({
    usd: { amount: 200_000_000n, currency: WalletCurrency.Usd },
    btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
  })
  if (higherPriceRatio instanceof Error) throw higherPriceRatio

  const btcAmount = (amount: number): BtcPaymentAmount =>
    paymentAmountFromNumber({
      amount,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount

  const calculate = async ({
    paymentAmount,
    priceRatio,
    strategyConfig = config,
  }: {
    paymentAmount: BtcPaymentAmount
    priceRatio?: WalletPriceRatio
    strategyConfig?: PercentageAboveThresholdFeeStrategyParams
  }) => {
    const strategy = PercentageAboveThresholdFeeStrategy(strategyConfig)
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
        ...config,
        basisPoints: 30.5,
      })
      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("rejects non-integer thresholdInCents", () => {
      const strategy = PercentageAboveThresholdFeeStrategy({
        ...config,
        thresholdInCents: 10_000.5,
      })
      expect(strategy).toBeInstanceOf(ValidationError)
    })
  })

  describe("calculate", () => {
    it("charges 0.3% of the full amount when strictly above the threshold", async () => {
      const paymentAmount = btcAmount(20_000) // $200.00
      const fee = await calculate({ paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee

      const expectedFee = calc.mulBasisPoints(paymentAmount, 30n)
      expect(fee).toEqual(expectedFee)
      expect(fee.amount).toBe(60n)
    })

    it("charges no fee at exactly the threshold ($100.00)", async () => {
      const paymentAmount = btcAmount(10_000) // exactly $100.00
      const fee = await calculate({ paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(0n)
    })

    it("charges no fee below the threshold", async () => {
      const paymentAmount = btcAmount(5_000) // $50.00
      const fee = await calculate({ paymentAmount, priceRatio })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toBe(0n)
    })

    it("compares the threshold in USD: a higher price ratio flips a sub-gate sat amount to charged", async () => {
      const paymentAmount = btcAmount(8_000)

      // At 1 cent/sat -> $80.00, below the $100 gate -> no fee
      const feeAtSpot = await calculate({ paymentAmount, priceRatio })
      expect(feeAtSpot).not.toBeInstanceOf(Error)
      if (feeAtSpot instanceof Error) throw feeAtSpot
      expect(feeAtSpot.amount).toBe(0n)

      // At 2 cents/sat -> $160.00, above the gate -> 0.3% of the full sat amount
      const feeAtHigher = await calculate({
        paymentAmount,
        priceRatio: higherPriceRatio,
      })
      expect(feeAtHigher).not.toBeInstanceOf(Error)
      if (feeAtHigher instanceof Error) throw feeAtHigher
      expect(feeAtHigher).toEqual(calc.mulBasisPoints(paymentAmount, 30n))
      expect(feeAtHigher.amount).toBe(24n)
    })

    it("fails closed with a ValidationError when no price ratio is available", async () => {
      const paymentAmount = btcAmount(20_000)
      const fee = await calculate({ paymentAmount, priceRatio: undefined })

      expect(fee).toBeInstanceOf(ValidationError)
    })
  })
})
