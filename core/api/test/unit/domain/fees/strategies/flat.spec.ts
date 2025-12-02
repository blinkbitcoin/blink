import { FlatFeeStrategy } from "@/domain/fees/strategies/flat"
import {
  WalletCurrency,
  ValidationError,
  BtcPaymentAmount,
  paymentAmountFromNumber,
} from "@/domain/shared"

describe("FlatFeeStrategy", () => {
  const mockPreviousFee: FeeDetails = {
    bankFee: paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount,
    minerFee: paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount,
    totalFee: paymentAmountFromNumber({
      amount: 0,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount,
  }

  describe("calculate", () => {
    it("should return the correct flat fee amount", async () => {
      const config: FlatFeeStrategyParams = { amount: 150 }
      const strategy = FlatFeeStrategy(config)

      const fee = await strategy.calculate({
        previousFee: mockPreviousFee,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual({
        amount: 150n,
        currency: WalletCurrency.Btc,
      })
    })

    it("should return a validation error for a non-integer amount in config", async () => {
      const config: FlatFeeStrategyParams = { amount: 10.5 }
      const strategy = FlatFeeStrategy(config)

      const fee = await strategy.calculate({
        previousFee: mockPreviousFee,
      } as FeeCalculationArgs)

      expect(fee).toBeInstanceOf(ValidationError)
    })

    it("should handle a negative amount from config", async () => {
      const config: FlatFeeStrategyParams = { amount: -50 }
      const strategy = FlatFeeStrategy(config)

      const fee = await strategy.calculate({
        previousFee: mockPreviousFee,
      } as FeeCalculationArgs)

      expect(fee).not.toBeInstanceOf(Error)
      expect(fee).toEqual(
        expect.objectContaining({
          amount: -50n,
        }),
      )
    })
  })
})
