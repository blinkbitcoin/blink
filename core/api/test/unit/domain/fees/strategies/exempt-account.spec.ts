import { ExemptAccountFeeStrategy } from "@/domain/fees/strategies/exempt-account"
import {
  AmountCalculator,
  BtcPaymentAmount,
  paymentAmountFromNumber,
  WalletCurrency,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("ExemptAccountFeeStrategy", () => {
  const config = {
    roles: ["dealer", "bankowner"],
    accountIds: ["accountId1" as AccountId],
    exemptValidatedMerchants: true,
  }
  const strategy = ExemptAccountFeeStrategy(config)

  const previousFee = {
    bankFee: paymentAmountFromNumber({
      amount: 1000,
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

  it("should apply a discount for a matching account ID", async () => {
    const fee = await strategy.calculate({
      accountId: "accountId1" as AccountId,
      accountRole: undefined,
      previousFee,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(calc.mul(previousFee.bankFee, -1n))
  })

  it("should apply a discount for a matching role", async () => {
    const fee = await strategy.calculate({
      accountId: "accountId2" as AccountId,
      accountRole: "dealer",
      previousFee,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(calc.mul(previousFee.bankFee, -1n))
  })

  it("should apply a discount for a validated merchant", async () => {
    const fee = await strategy.calculate({
      accountId: "accountId3" as AccountId,
      accountRole: "user",
      previousFee,
      isValidatedMerchant: true,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(calc.mul(previousFee.bankFee, -1n))
  })

  it("should not apply a discount for a non-matching account", async () => {
    const fee = await strategy.calculate({
      accountId: "accountId3" as AccountId,
      accountRole: "user",
      previousFee,
      isValidatedMerchant: false,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(
      paymentAmountFromNumber({
        amount: 0,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )
  })

  it("should not apply a discount for a validated merchant when exemptValidatedMerchants is false", async () => {
    const configNoMerchant = {
      roles: ["dealer", "bankowner"],
      accountIds: ["accountId1" as AccountId],
      exemptValidatedMerchants: false,
    }
    const strategyNoMerchant = ExemptAccountFeeStrategy(configNoMerchant)

    const fee = await strategyNoMerchant.calculate({
      accountId: "accountId3" as AccountId,
      accountRole: "user",
      previousFee,
      isValidatedMerchant: true,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(
      paymentAmountFromNumber({
        amount: 0,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )
  })

  it("should not apply a discount if account has no role", async () => {
    const fee = await strategy.calculate({
      accountId: "accountId4" as AccountId,
      accountRole: undefined,
      previousFee,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(
      paymentAmountFromNumber({
        amount: 0,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )
  })

  it("should return a positive fee if previousFee is negative", async () => {
    const negativePreviousFee = {
      bankFee: paymentAmountFromNumber({
        amount: -200,
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

    const fee = await strategy.calculate({
      accountId: "accountId1" as AccountId,
      accountRole: undefined,
      previousFee: negativePreviousFee,
    } as FeeCalculationArgs)

    expect(fee).not.toBeInstanceOf(Error)
    expect(fee).toStrictEqual(calc.mul(negativePreviousFee.bankFee, -1n))
  })
})
