import {
  feeCapCasesData,
  exponentialDecayConfigData,
  payoutQueueConfigData,
  multiplierCasesData,
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
  describe("calculate", () => {
    const fastFeeCalculator = ExponentialDecayStrategy(fastStrategyConfig)
    const mediumFeeCalculator = ExponentialDecayStrategy(mediumStrategyConfig)
    const slowFeeCalculator = ExponentialDecayStrategy(slowStrategyConfig)
    describe("Tier 1 (Fast)", () => {
      test.each(feeCapCasesData.tier1)(
        "amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const totalFee = await fastFeeCalculator.calculate({
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
          if (totalFee instanceof Error) {
            throw totalFee
          }
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })
    describe("Tier 2 (Medium)", () => {
      test.each(feeCapCasesData.tier2)(
        "amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const totalFee = await mediumFeeCalculator.calculate({
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
          if (totalFee instanceof Error) {
            throw totalFee
          }
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })

    describe("Tier 3 (Slow)", () => {
      test.each(feeCapCasesData.tier3)(
        "amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        async ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const totalFee = await slowFeeCalculator.calculate({
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
          if (totalFee instanceof Error) {
            throw totalFee
          }
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })

    it("should calculate fee correctly for large paymentAmount", async () => {
      const largeAmount = 1267650600228229401496703205376n
      const totalFee = await fastFeeCalculator.calculate({
        paymentAmount: { amount: largeAmount, currency: WalletCurrency.Btc },
        networkFee: {
          amount: { amount: BigInt(100), currency: WalletCurrency.Btc },
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
      if (totalFee instanceof Error) {
        throw totalFee
      }
      expect(totalFee.amount).toEqual(30330n)
    })
  })

  describe("calculateBaseMultiplier", () => {
    describe("Tier 1 (Fast)", () => {
      test.each(multiplierCasesData.tier1)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: fastStrategyConfig }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier 2 (Medium)", () => {
      test.each(multiplierCasesData.tier2)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: mediumStrategyConfig }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier 3 (Slow)", () => {
      test.each(multiplierCasesData.tier3)(
        "feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            calculateBaseMultiplier({ feeRate, params: slowStrategyConfig }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })
  })
})
