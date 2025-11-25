import { ImbalanceFeeStrategy } from "@/domain/fees/strategies/imbalance"
import {
  WalletCurrency,
  ValidationError,
  paymentAmountFromNumber,
  BtcPaymentAmount,
} from "@/domain/shared"

describe("ImbalanceFeeStrategy", () => {
  describe("configuration validation", () => {
    it("should return validation error for non-integer ratioAsBasisPoints", () => {
      const config: ImbalanceFeeStrategyParams = {
        threshold: 1000000,
        ratioAsBasisPoints: 50.5,
        daysLookback: 30,
        minFee: 2000,
      }
      const strategy = ImbalanceFeeStrategy(config)

      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("should return validation error for non-integer threshold", () => {
      const config: ImbalanceFeeStrategyParams = {
        threshold: 1000000.5,
        ratioAsBasisPoints: 50,
        daysLookback: 30,
        minFee: 2000,
      }
      const strategy = ImbalanceFeeStrategy(config)

      expect(strategy).toBeInstanceOf(ValidationError)
    })

    it("should return validation error for non-integer minFee", () => {
      const config: ImbalanceFeeStrategyParams = {
        threshold: 1000000,
        ratioAsBasisPoints: 50,
        daysLookback: 30,
        minFee: 2000.5,
      }
      const strategy = ImbalanceFeeStrategy(config)

      expect(strategy).toBeInstanceOf(ValidationError)
    })
  })

  describe("calculate", () => {
    const config: ImbalanceFeeStrategyParams = {
      threshold: 1000000,
      ratioAsBasisPoints: 50,
      daysLookback: 30,
      minFee: 2000,
    }

    const mockPaymentAmount = paymentAmountFromNumber({
      amount: 500000,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount

    it("should return zero fee when imbalance is not provided", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(0n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should return minFee when calculated fee is below minimum", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: 100000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2000n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should calculate fee based on imbalance above threshold", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: 2000000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2500n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should return minFee when imbalance is below threshold", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: 500000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2000n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should handle negative imbalance", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: -500000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2000n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should calculate fee correctly for large imbalance", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const largeImbalance = paymentAmountFromNumber({
        amount: 10000000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance: largeImbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2500n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should handle zero imbalance", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: 0,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2000n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })

    it("should calculate correct fee for imbalance exactly at threshold", () => {
      const strategy = ImbalanceFeeStrategy(config)
      if (strategy instanceof Error) throw strategy

      const imbalance = paymentAmountFromNumber({
        amount: 1000000,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount

      const fee = strategy.calculate({
        paymentAmount: mockPaymentAmount,
        imbalance,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.amount).toEqual(2500n)
      expect(fee.currency).toEqual(WalletCurrency.Btc)
    })
  })
})
