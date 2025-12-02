import { PercentageFeeStrategy } from "@/domain/fees/strategies/percentage"
import {
  AmountCalculator,
  WalletCurrency,
  paymentAmountFromNumber,
  BtcPaymentAmount,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("PercentageFeeStrategy", () => {
  describe("calculate", () => {
    const mockPaymentAmount = paymentAmountFromNumber({
      amount: 10000,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount

    it("should calculate the correct percentage fee", async () => {
      const config: PercentageFeeStrategyParams = { basisPoints: 50 }
      const strategy = PercentageFeeStrategy(config)

      const fee = await strategy.calculate({
        paymentAmount: mockPaymentAmount,
      } as FeeCalculationArgs)

      const expectedFee = calc.mulBasisPoints(mockPaymentAmount, 50n)
      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual(expectedFee)
      expect(fee).toEqual({ amount: 50n, currency: WalletCurrency.Btc })
    })

    it("should return zero for zero basis points", async () => {
      const config: PercentageFeeStrategyParams = { basisPoints: 0 }
      const strategy = PercentageFeeStrategy(config)

      const fee = await strategy.calculate({
        paymentAmount: mockPaymentAmount,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 0n, currency: WalletCurrency.Btc })
    })

    it("should return a negative fee for negative basis points", async () => {
      const config: PercentageFeeStrategyParams = { basisPoints: -10 }
      const strategy = PercentageFeeStrategy(config)

      const fee = await strategy.calculate({
        paymentAmount: mockPaymentAmount,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: -10n, currency: WalletCurrency.Btc })
    })

    it("should handle large basis points (over 100%)", async () => {
      const config: PercentageFeeStrategyParams = { basisPoints: 20000 }
      const strategy = PercentageFeeStrategy(config)

      const fee = await strategy.calculate({
        paymentAmount: mockPaymentAmount,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({ amount: 20000n, currency: WalletCurrency.Btc })
    })
  })
})
