import { calculateCompositeFee } from "@/domain/fees"
import {
  WalletCurrency,
  paymentAmountFromNumber,
  BtcPaymentAmount,
  ValidationError,
  AmountCalculator,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("calculateCompositeFee", () => {
  const mockPaymentAmount = paymentAmountFromNumber({
    amount: 100000,
    currency: WalletCurrency.Btc,
  }) as BtcPaymentAmount

  const mockNetworkFee: NetworkFee = {
    amount: paymentAmountFromNumber({
      amount: 100,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount,
    feeRate: 10,
  }

  const mockAccount = {} as Account
  const mockWallet = {} as Wallet

  const baseFeeCalculationArgs: Omit<FeeCalculationArgs, "previousFee"> = {
    paymentAmount: mockPaymentAmount,
    networkFee: mockNetworkFee,
    account: mockAccount,
    wallet: mockWallet,
  }

  it("should return networkFee if no strategies are provided", () => {
    const strategies: FeeStrategy[] = []
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.currency).toEqual(mockNetworkFee.amount.currency)
  })

  it("should apply a single flat fee strategy correctly", () => {
    const flatFeeConfig: FlatFeeStrategyParams = { amount: 50 }
    const strategies: FeeStrategy[] = [
      { name: "Flat", strategy: "flat", params: flatFeeConfig },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    const expectedFee = calc.add(mockNetworkFee.amount, {
      amount: 50n,
      currency: WalletCurrency.Btc,
    })
    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should apply a single percentage fee strategy correctly", () => {
    const percentageFeeConfig: PercentageFeeStrategyParams = { basisPoints: 100 }
    const strategies: FeeStrategy[] = [
      { name: "Percentage", strategy: "percentage", params: percentageFeeConfig },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    const percentageAmount = calc.mulBasisPoints(mockPaymentAmount, 100n)
    const expectedFee = calc.add(mockNetworkFee.amount, percentageAmount)
    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should apply a single tiered fee strategy correctly", () => {
    const tieredFeeConfig: TieredFlatFeeStrategyParams = {
      tiers: [
        { maxAmount: 50000, amount: 200 },
        { maxAmount: null, amount: 400 },
      ],
    }
    const strategies: FeeStrategy[] = [
      { name: "Tiered", strategy: "tieredFlat", params: tieredFeeConfig },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    const tieredAmount = paymentAmountFromNumber({
      amount: 400,
      currency: WalletCurrency.Btc,
    })
    expect(tieredAmount).not.toBeInstanceOf(Error)
    const expectedFee = calc.add(mockNetworkFee.amount, tieredAmount as BtcPaymentAmount)
    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should apply multiple strategies in order", () => {
    const flatFeeConfig: FlatFeeStrategyParams = { amount: 50 }
    const percentageFeeConfig: PercentageFeeStrategyParams = { basisPoints: 10 }
    const tieredFeeConfig: TieredFlatFeeStrategyParams = {
      tiers: [
        { maxAmount: 50000, amount: 200 },
        { maxAmount: null, amount: 400 },
      ],
    }

    const strategies: FeeStrategy[] = [
      { name: "Flat", strategy: "flat", params: flatFeeConfig },
      { name: "Percentage", strategy: "percentage", params: percentageFeeConfig },
      { name: "Tiered", strategy: "tieredFlat", params: tieredFeeConfig },
    ]

    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    let expectedFee = mockNetworkFee.amount
    expectedFee = calc.add(
      expectedFee,
      paymentAmountFromNumber({
        amount: 50,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )
    expectedFee = calc.add(expectedFee, calc.mulBasisPoints(mockPaymentAmount, 10n))
    expectedFee = calc.add(
      expectedFee,
      paymentAmountFromNumber({
        amount: 400,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should handle an unknown strategy by skipping it", () => {
    const strategies: FeeStrategy[] = [
      { name: "Flat", strategy: "flat", params: { amount: 50 } },
      {
        name: "Unknown",
        strategy: "unknown" as "flat",
        params: {} as FlatFeeStrategyParams,
      },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    const expectedFee = calc.add(mockNetworkFee.amount, {
      amount: 50n,
      currency: WalletCurrency.Btc,
    })
    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should return an error if a strategy returns a ValidationError", () => {
    const invalidFlatFeeConfig: FlatFeeStrategyParams = { amount: 10.5 }
    const strategies: FeeStrategy[] = [
      { name: "Invalid Flat", strategy: "flat", params: invalidFlatFeeConfig },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    expect(fee).toBeInstanceOf(ValidationError)
  })

  it("should pass previousFee correctly to subsequent strategies", () => {
    const flatFeeConfig: FlatFeeStrategyParams = { amount: 50 }
    const percentageFeeConfig: PercentageFeeStrategyParams = { basisPoints: 10 }
    const strategies: FeeStrategy[] = [
      { name: "Flat", strategy: "flat", params: flatFeeConfig },
      { name: "Percentage", strategy: "percentage", params: percentageFeeConfig },
    ]

    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    let expectedFee = mockNetworkFee.amount
    expectedFee = calc.add(
      expectedFee,
      paymentAmountFromNumber({
        amount: 50,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    )
    expectedFee = calc.add(expectedFee, calc.mulBasisPoints(mockPaymentAmount, 10n))

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(expectedFee.amount)
    expect(fee.currency).toEqual(expectedFee.currency)
  })

  it("should return a ValidationError if a tiered strategy config has multiple null tiers", () => {
    const invalidTieredFeeConfig: TieredFlatFeeStrategyParams = {
      tiers: [
        { maxAmount: 100000, amount: 200 },
        { maxAmount: null, amount: 500 },
        { maxAmount: null, amount: 1000 },
      ],
    }
    const strategies: FeeStrategy[] = [
      { name: "Invalid Tiered", strategy: "tieredFlat", params: invalidTieredFeeConfig },
    ]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    expect(fee).toBeInstanceOf(ValidationError)
  })

  it("should return networkFee when totalFee is negative but networkFee is positive", () => {
    const discountStrategy: FeeStrategy = {
      name: "Discount",
      strategy: "flat",
      params: { amount: -200 },
    }
    const strategies: FeeStrategy[] = [discountStrategy]
    const fee = calculateCompositeFee({ ...baseFeeCalculationArgs, strategies })

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.currency).toEqual(mockNetworkFee.amount.currency)
  })

  it("should return zero when totalFee is negative and networkFee is also negative", () => {
    const negativeNetworkFee: NetworkFee = {
      amount: paymentAmountFromNumber({
        amount: -50,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    }

    const negativeStrategyFee: FeeStrategy = {
      name: "Negative Strategy",
      strategy: "flat",
      params: { amount: -50 },
    }

    const strategies: FeeStrategy[] = [negativeStrategyFee]

    const fee = calculateCompositeFee({
      ...baseFeeCalculationArgs,
      networkFee: negativeNetworkFee,
      strategies,
    })

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.amount).toEqual(0n)
    expect(fee.currency).toEqual(WalletCurrency.Btc)
  })

  it("should apply a discount for an internal account", () => {
    const internalAccount = { id: "internalId", role: "dealer" } as Account

    const strategies: FeeStrategy[] = [
      { name: "Flat", strategy: "flat", params: { amount: 100 } },
      {
        name: "Internal Discount",
        strategy: "internal",
        params: { roles: ["dealer"], accountIds: [] },
      },
    ]

    const fee = calculateCompositeFee({
      ...baseFeeCalculationArgs,
      account: internalAccount,
      strategies,
    })

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee

    expect(fee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.currency).toEqual(mockNetworkFee.amount.currency)
  })
})
