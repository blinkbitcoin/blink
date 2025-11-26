import { calculateCompositeFee } from "@/domain/fees"
import {
  WalletCurrency,
  paymentAmountFromNumber,
  BtcPaymentAmount,
  AmountCalculator,
} from "@/domain/shared"

const calc = AmountCalculator()

describe("calculateCompositeFee", () => {
  const mockPaymentAmount = paymentAmountFromNumber({
    amount: 100000,
    currency: WalletCurrency.Btc,
  }) as BtcPaymentAmount

  const mockNetworkFee = {
    amount: paymentAmountFromNumber({
      amount: 100,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount,
    feeRate: 10,
  }

  const baseFeeCalculationArgs = {
    paymentAmount: mockPaymentAmount,
    networkFee: mockNetworkFee,
    accountId: "accountId" as AccountId,
    accountRole: undefined,
  }

  it("should return networkFee if no strategies are provided", async () => {
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies: [] as FeeStrategy[],
    } as CalculateCompositeFeeArgs)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.totalFee.currency).toEqual(mockNetworkFee.amount.currency)
  })

  it("should apply a single flat fee strategy correctly", async () => {
    const strategies = [{ name: "Flat", strategy: "flat", params: { amount: 50 } }]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    const expectedFee = calc.add(mockNetworkFee.amount, {
      amount: 50n,
      currency: WalletCurrency.Btc,
    })

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should apply a single percentage fee strategy correctly", async () => {
    const strategies = [
      { name: "Percentage", strategy: "percentage", params: { basisPoints: 100 } },
    ]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    const percentageAmount = calc.mulBasisPoints(mockPaymentAmount, 100n)
    const expectedFee = calc.add(mockNetworkFee.amount, percentageAmount)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should apply a single tiered fee strategy correctly", async () => {
    const strategies = [
      {
        name: "Tiered",
        strategy: "tieredFlat",
        params: {
          tiers: [
            { maxAmount: 50000, amount: 200 },
            { maxAmount: null, amount: 400 },
          ],
        },
      },
    ]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    const tieredAmount = paymentAmountFromNumber({
      amount: 400,
      currency: WalletCurrency.Btc,
    }) as BtcPaymentAmount
    const expectedFee = calc.add(mockNetworkFee.amount, tieredAmount)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should apply multiple strategies in order", async () => {
    const strategies = [
      { name: "Flat", strategy: "flat", params: { amount: 50 } },
      { name: "Percentage", strategy: "percentage", params: { basisPoints: 10 } },
      {
        name: "Tiered",
        strategy: "tieredFlat",
        params: {
          tiers: [
            { maxAmount: 50000, amount: 200 },
            { maxAmount: null, amount: 400 },
          ],
        },
      },
    ]

    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

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
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should handle an unknown strategy by skipping it", async () => {
    const strategies = [
      { name: "Flat", strategy: "flat", params: { amount: 50 } },
      {
        name: "Unknown",
        strategy: "unknown" as "flat",
        params: {} as FlatFeeStrategyParams,
      },
    ]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    const expectedFee = calc.add(mockNetworkFee.amount, {
      amount: 50n,
      currency: WalletCurrency.Btc,
    })
    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should return an error if a strategy returns a ValidationError", async () => {
    const strategies = [
      { name: "Invalid Flat", strategy: "flat", params: { amount: 10.5 } },
    ]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    expect(fee).toBeInstanceOf(Error)
  })

  it("should pass previousFee correctly to subsequent strategies", async () => {
    const strategies = [
      { name: "Flat", strategy: "flat", params: { amount: 50 } },
      { name: "Percentage", strategy: "percentage", params: { basisPoints: 10 } },
    ]

    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

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
    expect(fee.totalFee.amount).toEqual(expectedFee.amount)
    expect(fee.totalFee.currency).toEqual(expectedFee.currency)
  })

  it("should return a ValidationError if a tiered strategy config has multiple null tiers", async () => {
    const strategies = [
      {
        name: "Invalid Tiered",
        strategy: "tieredFlat",
        params: {
          tiers: [
            { maxAmount: 100000, amount: 200 },
            { maxAmount: null, amount: 500 },
            { maxAmount: null, amount: 1000 },
          ],
        },
      },
    ]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    expect(fee).toBeInstanceOf(Error)
  })

  it("should return networkFee when totalFee is negative but networkFee is positive", async () => {
    const strategies = [{ name: "Discount", strategy: "flat", params: { amount: -200 } }]
    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      strategies,
    } as CalculateCompositeFeeArgs)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.totalFee.currency).toEqual(mockNetworkFee.amount.currency)
  })

  it("should return zero when totalFee is negative and networkFee is also negative", async () => {
    const negativeNetworkFee = {
      amount: paymentAmountFromNumber({
        amount: -50,
        currency: WalletCurrency.Btc,
      }) as BtcPaymentAmount,
    }

    const strategies = [
      { name: "Negative Strategy", strategy: "flat", params: { amount: -50 } },
    ]

    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      networkFee: negativeNetworkFee,
      strategies,
    } as CalculateCompositeFeeArgs)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee
    expect(fee.totalFee.amount).toEqual(0n)
    expect(fee.totalFee.currency).toEqual(WalletCurrency.Btc)
  })

  it("should apply a discount for an internal account", async () => {
    const strategies = [
      { name: "Flat", strategy: "flat", params: { amount: 100 } },
      {
        name: "Internal Discount",
        strategy: "internal",
        params: { roles: ["dealer"], accountIds: ["internalId" as AccountId] },
      },
    ]

    const fee = await calculateCompositeFee({
      ...baseFeeCalculationArgs,
      accountId: "internalId" as AccountId,
      accountRole: "dealer",
      strategies,
    } as CalculateCompositeFeeArgs)

    expect(fee).not.toBeInstanceOf(Error)
    if (fee instanceof Error) throw fee

    expect(fee.totalFee.amount).toEqual(mockNetworkFee.amount.amount)
    expect(fee.totalFee.currency).toEqual(mockNetworkFee.amount.currency)
  })
})
