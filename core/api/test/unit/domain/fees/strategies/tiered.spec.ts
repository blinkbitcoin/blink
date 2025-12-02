import { TieredFeeStrategy } from "@/domain/fees/strategies/tiered"
import {
  WalletCurrency,
  paymentAmountFromNumber,
  BtcPaymentAmount,
  ValidationError,
} from "@/domain/shared"

describe("TieredFeeStrategy", () => {
  const basePaymentAmount = paymentAmountFromNumber({
    amount: 100000,
    currency: WalletCurrency.Btc,
  }) as BtcPaymentAmount

  describe("constructor validation", () => {
    it("should return an error if there are multiple null maxAmount tiers", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 100000, amount: 200 },
          { maxAmount: null, amount: 500 },
          { maxAmount: null, amount: 1000 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("should correctly sort tiers if not already sorted", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 200000, amount: 500 },
          { maxAmount: 50000, amount: 100 },
          { maxAmount: 100000, amount: 200 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      expect(strategy).not.toBeInstanceOf(ValidationError)
    })
  })

  describe("calculate", () => {
    it("should return the correct fee for a payment amount in the first tier", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 50000, amount: 100 },
          { maxAmount: 100000, amount: 200 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const paymentAmount = paymentAmountFromNumber({
        amount: 30000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount
      const fee = await strategy.calculate({ paymentAmount } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 100n, currency: WalletCurrency.Btc })
    })

    it("should return the correct fee for a payment amount in an intermediate tier", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 50000, amount: 100 },
          { maxAmount: 100000, amount: 200 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const paymentAmount = paymentAmountFromNumber({
        amount: 80000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount
      const fee = await strategy.calculate({ paymentAmount } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 200n, currency: WalletCurrency.Btc })
    })

    it("should return the correct fee for a payment amount exceeding all fixed tiers (null maxAmount)", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 50000, amount: 100 },
          { maxAmount: 100000, amount: 200 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const paymentAmount = paymentAmountFromNumber({
        amount: 150000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount
      const fee = await strategy.calculate({ paymentAmount } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 500n, currency: WalletCurrency.Btc })
    })

    it("should handle exact tier boundary amounts", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 50000, amount: 100 },
          { maxAmount: 100000, amount: 200 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const paymentAmount = paymentAmountFromNumber({
        amount: 50000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount
      const fee = await strategy.calculate({ paymentAmount } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 100n, currency: WalletCurrency.Btc })
    })

    it("should return zero fee if no tiers are defined", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [],
      }
      const strategy = TieredFeeStrategy(config)
      expect(strategy).not.toBeInstanceOf(Error)
      if (strategy instanceof Error) throw strategy
      const fee = await strategy.calculate({
        paymentAmount: basePaymentAmount,
      } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 0n, currency: WalletCurrency.Btc })
    })

    it("should return a validation error for a non-integer amount in tier config", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 100000, amount: 200.5 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        paymentAmount: basePaymentAmount,
      } as FeeCalculationArgs)
      expect(fee).toBeInstanceOf(ValidationError)
    })

    it("should handle a negative amount from tier config", async () => {
      const config: TieredFlatFeeStrategyParams = {
        tiers: [
          { maxAmount: 100000, amount: -200 },
          { maxAmount: null, amount: 500 },
        ],
      }
      const strategy = TieredFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = await strategy.calculate({
        paymentAmount: basePaymentAmount,
      } as FeeCalculationArgs)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: -200n, currency: WalletCurrency.Btc })
    })
  })
})
