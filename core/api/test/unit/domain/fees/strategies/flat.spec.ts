import { FlatFeeStrategy } from "@/domain/fees/strategies/flat"
import { WalletCurrency, ValidationError } from "@/domain/shared"

describe("FlatFeeStrategy", () => {
  describe("calculate", () => {
    it("should return the correct flat fee amount", () => {
      const config: FlatFeeStrategyParams = { amount: 150 }
      const strategy = FlatFeeStrategy(config)

      const fee = strategy.calculate({} as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({
        amount: 150n,
        currency: WalletCurrency.Btc,
      })
    })

    it("should return a validation error for a non-integer amount in config", () => {
      const config: FlatFeeStrategyParams = { amount: 10.5 }
      const strategy = FlatFeeStrategy(config)

      const fee = strategy.calculate({} as FeeCalculationArgs)

      expect(fee).toBeInstanceOf(ValidationError)
    })

    it("should handle a negative amount from config", () => {
      const config: FlatFeeStrategyParams = { amount: -50 }
      const strategy = FlatFeeStrategy(config)

      const fee = strategy.calculate({} as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual(
        expect.objectContaining({
          amount: -50n,
        }),
      )
    })
  })
})
