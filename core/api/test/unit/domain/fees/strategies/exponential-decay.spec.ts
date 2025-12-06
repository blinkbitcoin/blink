import {
  feeCapCasesData,
  exponentialDecayConfigData,
  payoutQueueConfigData,
} from "./exponential-decay.data"

import { WalletCurrency } from "@/domain/shared"
import { ExponentialDecayStrategy } from "@/domain/fees/strategies/exponential-decay"

describe("ExponentialDecayStrategy", () => {
  describe("calculate", () => {
    const fastConfigParams = payoutQueueConfigData[0].feeMethodConfig.exponentialDecay
    const fastStrategyConfig: ExponentialDecayFeeStrategyParams = {
      ...exponentialDecayConfigData,
      ...fastConfigParams,
    }
    const fastFeeCalculator = ExponentialDecayStrategy(fastStrategyConfig)

    test.each(feeCapCasesData.tier1)(
      "Tier1: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
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

    const mediumConfigParams = payoutQueueConfigData[1].feeMethodConfig.exponentialDecay
    const mediumStrategyConfig: ExponentialDecayFeeStrategyParams = {
      ...exponentialDecayConfigData,
      ...mediumConfigParams,
    }
    const mediumFeeCalculator = ExponentialDecayStrategy(mediumStrategyConfig)

    test.each(feeCapCasesData.tier2)(
      "Tier2: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
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

    const slowConfigParams = payoutQueueConfigData[2].feeMethodConfig.exponentialDecay
    const slowStrategyConfig: ExponentialDecayFeeStrategyParams = {
      ...exponentialDecayConfigData,
      ...slowConfigParams,
    }
    const slowFeeCalculator = ExponentialDecayStrategy(slowStrategyConfig)

    test.each(feeCapCasesData.tier3)(
      "Tier3: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
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

    it("should return ValidationError for paymentAmount that causes Number conversion to Infinity", async () => {
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
})
