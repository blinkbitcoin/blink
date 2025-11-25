import { InternalAccountFeeStrategy } from "@/domain/fees/strategies/internal"
import {
  AmountCalculator,
  WalletCurrency,
  paymentAmountFromNumber,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("InternalAccountFeeStrategy", () => {
  const config: InternalAccountFeeStrategyParams = {
    roles: ["dealer", "bankowner"],
    accountIds: ["accountId1" as AccountId],
  }
  const strategy = InternalAccountFeeStrategy(config)
  if (strategy instanceof Error) throw strategy

  const previousFee = paymentAmountFromNumber({
    amount: 1000,
    currency: WalletCurrency.Btc,
  }) as BtcPaymentAmount

  it("should apply a discount for a matching account ID", () => {
    const account = { id: "accountId1" } as Account
    const fee = strategy.calculate({ account, previousFee } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toEqual(calc.mul(previousFee, -1n))
  })

  it("should apply a discount for a matching role", () => {
    const account = { id: "accountId2", role: "dealer" } as Account
    const fee = strategy.calculate({ account, previousFee } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toEqual(calc.mul(previousFee, -1n))
  })

  it("should not apply a discount for a non-matching account", () => {
    const account = { id: "accountId3", role: "user" } as Account
    const fee = strategy.calculate({ account, previousFee } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toEqual({ amount: 0n, currency: WalletCurrency.Btc })
  })

  it("should not apply a discount if account has no role", () => {
    const account = { id: "accountId4" } as Account
    const fee = strategy.calculate({ account, previousFee } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toEqual({ amount: 0n, currency: WalletCurrency.Btc })
  })

  it("should return a positive fee if previousFee is negative", () => {
    const account = { id: "accountId1" } as Account
    const negativePreviousFee = paymentAmountFromNumber({
      amount: -200,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount
    const fee = strategy.calculate({
      account,
      previousFee: negativePreviousFee,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toEqual({ amount: 200n, currency: WalletCurrency.Btc })
  })
})
