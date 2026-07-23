import {
  feeCapCasesData,
  exponentialDecayConfigData,
  payoutQueueConfigData,
  multiplierCasesData,
  standardTierSpecParams,
  capBindingSpecVectors,
  nonBindingSpecVectors,
  floorBindingSpecCase,
  capFloorConflictSpecCase,
} from "./exponential-decay.data"

import { WalletCurrency } from "@/domain/shared"
import {
  ExponentialDecayStrategy,
  calculateBaseMultiplier,
} from "@/domain/fees/strategies/exponential-decay"

const fastConfigParams = payoutQueueConfigData[0].feeMethodConfig.exponentialDecay
const fastStrategyConfig = {
  ...exponentialDecayConfigData,
  ...fastConfigParams,
}

const mediumConfigParams = payoutQueueConfigData[1].feeMethodConfig.exponentialDecay
const mediumStrategyConfig = {
  ...exponentialDecayConfigData,
  ...mediumConfigParams,
}

const slowConfigParams = payoutQueueConfigData[2].feeMethodConfig.exponentialDecay
const slowStrategyConfig = {
  ...exponentialDecayConfigData,
  ...slowConfigParams,
}

describe("ExponentialDecayStrategy", () => {
  const expectedFee = (expectedSats: number, minerFee: number) =>
    BigInt(Math.max(0, minerFee < 0 ? 0 : expectedSats - minerFee))

  describe("calculate", () => {
    const fastFeeCalculator = ExponentialDecayStrategy(fastStrategyConfig)
    const mediumFeeCalculator = ExponentialDecayStrategy(mediumStrategyConfig)
    const slowFeeCalculator = ExponentialDecayStrategy(slowStrategyConfig)
    describe("Tier 1 (Fast)", () => {
      test.each(feeCapCasesData.tier1)(
        "amount=$satsAmount sats, feeRate=$feeRate, minerFee=$minerFee => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const bankFee = await fastFeeCalculator.calculate({
            paymentAmount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            networkFee: {
              amount: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
              feeRate: feeRate,
            },
            accountId: "dummyAccountId" as AccountId,
            wallet: {
              id: "dummyWalletId" as WalletId,
              currency: WalletCurrency.Btc,
              accountId: "dummyAccountId" as AccountId,
            },
            previousFee: {
              totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
            },
          })
          if (bankFee instanceof Error) {
            throw bankFee
          }
          expect(bankFee.amount).toEqual(expectedFee(expectedSats, minerFee))
        },
      )
    })
    describe("Tier 2 (Medium)", () => {
      test.each(feeCapCasesData.tier2)(
        "amount=$satsAmount sats, feeRate=$feeRate, minerFee=$minerFee => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const bankFee = await mediumFeeCalculator.calculate({
            paymentAmount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            networkFee: {
              amount: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
              feeRate: feeRate,
            },
            accountId: "dummyAccountId" as AccountId,
            wallet: {
              id: "dummyWalletId" as WalletId,
              currency: WalletCurrency.Btc,
              accountId: "dummyAccountId" as AccountId,
            },
            previousFee: {
              totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
            },
          })
          if (bankFee instanceof Error) {
            throw bankFee
          }
          expect(bankFee.amount).toEqual(expectedFee(expectedSats, minerFee))
        },
      )
    })

    describe("Tier 3 (Slow)", () => {
      test.each(feeCapCasesData.tier3)(
        "amount=$satsAmount sats, feeRate=$feeRate, minerFee=$minerFee => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const bankFee = await slowFeeCalculator.calculate({
            paymentAmount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            networkFee: {
              amount: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
              feeRate: feeRate,
            },
            accountId: "dummyAccountId" as AccountId,
            wallet: {
              id: "dummyWalletId" as WalletId,
              currency: WalletCurrency.Btc,
              accountId: "dummyAccountId" as AccountId,
            },
            previousFee: {
              totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
              minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
            },
          })
          if (bankFee instanceof Error) {
            throw bankFee
          }
          expect(bankFee.amount).toEqual(expectedFee(expectedSats, minerFee))
        },
      )
    })

    it("should calculate fee correctly for large paymentAmount", async () => {
      const largeAmount = 1267650600228229401496703205376n
      const networkFee = 100n
      const bankFee = await fastFeeCalculator.calculate({
        paymentAmount: { amount: largeAmount, currency: WalletCurrency.Btc },
        networkFee: {
          amount: { amount: networkFee, currency: WalletCurrency.Btc },
          feeRate: 1,
        },
        accountId: "dummyAccountId" as AccountId,
        wallet: {
          id: "dummyWalletId" as WalletId,
          currency: WalletCurrency.Btc,
          accountId: "dummyAccountId" as AccountId,
        },
        previousFee: {
          totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
          bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
          minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
        },
      })
      if (bankFee instanceof Error) {
        throw bankFee
      }
      expect(bankFee.amount).toEqual(30330n - networkFee)
    })

    it("should calculate fee correctly for large networkFee", async () => {
      const largeAmount = 1267650600228229401496703205376n
      const bankFee = await fastFeeCalculator.calculate({
        paymentAmount: { amount: 210000n, currency: WalletCurrency.Btc },
        networkFee: {
          amount: { amount: largeAmount, currency: WalletCurrency.Btc },
          feeRate: 1,
        },
        accountId: "dummyAccountId" as AccountId,
        wallet: {
          id: "dummyWalletId" as WalletId,
          currency: WalletCurrency.Btc,
          accountId: "dummyAccountId" as AccountId,
        },
        previousFee: {
          totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
          bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
          minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
        },
      })
      if (bankFee instanceof Error) {
        throw bankFee
      }
      expect(bankFee.amount).toEqual(20716558285908372n)
    })
  })

  describe("calculateBaseMultiplier", () => {
    describe("Tier 1 (Fast)", () => {
      test.each(multiplierCasesData.tier1)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: fastStrategyConfig }).toNumber(),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier 2 (Medium)", () => {
      test.each(multiplierCasesData.tier2)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: mediumStrategyConfig }).toNumber(),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier 3 (Slow)", () => {
      test.each(multiplierCasesData.tier3)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: slowStrategyConfig }).toNumber(),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })
  })
})

describe("ExponentialDecayStrategy minFee floor + effectiveRateCap (spec vectors)", () => {
  const calculateBankFee = async (
    calculator: IFeeStrategy,
    {
      satsAmount,
      feeRate,
      minerFee,
    }: { satsAmount: number; feeRate: number; minerFee: number },
  ): Promise<bigint> => {
    const bankFee = await calculator.calculate({
      paymentAmount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
      networkFee: {
        amount: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
        feeRate,
      },
      accountId: "dummyAccountId" as AccountId,
      wallet: {
        id: "dummyWalletId" as WalletId,
        currency: WalletCurrency.Btc,
        accountId: "dummyAccountId" as AccountId,
      },
      previousFee: {
        totalFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
        bankFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
        minerFee: { amount: BigInt(0), currency: WalletCurrency.Btc },
      },
    })
    if (bankFee instanceof Error) {
      throw bankFee
    }
    return bankFee.amount
  }

  const clampedCalculator = ExponentialDecayStrategy(standardTierSpecParams)

  describe("cap-binding spec vectors (exact)", () => {
    test.each(capBindingSpecVectors)(
      "amount=$satsAmount sats, feeRate=$feeRate, minerFee=$minerFee => total $expectedSats sats",
      async ({ satsAmount, feeRate, minerFee, expectedSats }) => {
        const bankFee = await calculateBankFee(clampedCalculator, {
          satsAmount,
          feeRate,
          minerFee,
        })
        expect(bankFee + BigInt(minerFee)).toEqual(BigInt(expectedSats))
      },
    )
  })

  describe("non-binding spec vectors (within ±1 sat)", () => {
    // ±1 sat vs the spec totals: core ceils the bank fee where the spec rounds the total
    test.each(nonBindingSpecVectors)(
      "amount=$satsAmount sats, feeRate=$feeRate, minerFee=$minerFee => total $expectedSats ±1 sats",
      async ({ satsAmount, feeRate, minerFee, expectedSats }) => {
        const bankFee = await calculateBankFee(clampedCalculator, {
          satsAmount,
          feeRate,
          minerFee,
        })
        const actualTotal = Number(bankFee) + minerFee
        expect(Math.abs(actualTotal - expectedSats)).toBeLessThanOrEqual(1)
      },
    )
  })

  describe("minFee floor", () => {
    it("lifts total to exactly minFee when the floor binds", async () => {
      const floorCalculator = ExponentialDecayStrategy({
        ...standardTierSpecParams,
        effectiveRateCap: 0,
      })
      const { satsAmount, feeRate, minerFee, expectedSats } = floorBindingSpecCase
      const bankFee = await calculateBankFee(floorCalculator, {
        satsAmount,
        feeRate,
        minerFee,
      })
      expect(bankFee + BigInt(minerFee)).toEqual(BigInt(expectedSats))
      expect(bankFee).toEqual(50n)
    })
  })

  describe("cap vs floor conflict", () => {
    it("applies the cap after the floor when they overlap", async () => {
      const { satsAmount, feeRate, minerFee, expectedBankFee } = capFloorConflictSpecCase
      const bankFee = await calculateBankFee(clampedCalculator, {
        satsAmount,
        feeRate,
        minerFee,
      })
      expect(bankFee).toEqual(BigInt(expectedBankFee))
    })
  })
})
