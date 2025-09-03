import { PayoutSpeed } from "@/domain/bitcoin/onchain"
import { WalletCurrency } from "@/domain/shared"
import { OnChainExpDecayFees } from "@/domain/wallets"

import {
  feeCapCasesMock,
  multiplierCasesMock,
  exponentialDecayConfigMock,
  payoutQueueConfigMock,
} from "test/mocks/exponential-decay-calculator"

const feeCalculator = OnChainExpDecayFees({
  exponentialDecayConfig: exponentialDecayConfigMock,
  payoutQueueConfig: payoutQueueConfigMock,
})

describe("OnChainExpDecayFees", () => {
  describe("expDecayFee", () => {
    describe("Tier #1 (Fast)", () => {
      test.each(feeCapCasesMock.tier1)(
        "Tier1: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            minerFee: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
            speed: PayoutSpeed.Fast,
            feeRate,
          })
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })

    describe("Tier #2 (Medium)", () => {
      test.each(feeCapCasesMock.tier2)(
        "Tier2: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            minerFee: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
            speed: PayoutSpeed.Medium,
            feeRate,
          })
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })

    describe("Tier #3 (Slow)", () => {
      test.each(feeCapCasesMock.tier3)(
        "Tier3: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        ({ satsAmount, feeRate, expectedSats, minerFee }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            minerFee: { amount: BigInt(minerFee), currency: WalletCurrency.Btc },
            speed: PayoutSpeed.Slow,
            feeRate,
          })
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })
  })

  describe("calculateBaseMultiplier", () => {
    describe("Tier #1 (Fast)", () => {
      test.each(multiplierCasesMock.tier1)(
        "Fast, feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            feeCalculator.calculateBaseMultiplier({ speed: PayoutSpeed.Fast, feeRate }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier #2 (Medium)", () => {
      test.each(multiplierCasesMock.tier2)(
        "Medium, feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            feeCalculator.calculateBaseMultiplier({ speed: PayoutSpeed.Medium, feeRate }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier #3 (Slow)", () => {
      test.each(multiplierCasesMock.tier3)(
        "Slow, feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            feeCalculator.calculateBaseMultiplier({ speed: PayoutSpeed.Slow, feeRate }),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })
  })
})
