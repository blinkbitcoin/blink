import { PayoutSpeed } from "@/domain/bitcoin/onchain"
import { WalletCurrency } from "@/domain/shared"
import { OnChainExpDecayFees } from "@/domain/wallets"

import { generateTxSizeCases } from "test/helpers/withdrawal-fee-calculator"
import {
  costToBankCasesMock,
  feeCapCasesMock,
  multiplierCasesMock,
  onchainFeeSettingsMock,
  TRANSACTION_SIZE_MATRIX,
} from "test/mocks/exponential-decay-calculator"

const txSizeCases = generateTxSizeCases(TRANSACTION_SIZE_MATRIX)
const feeCalculator = OnChainExpDecayFees({
  onchain: onchainFeeSettingsMock,
})

describe("OnChainExpDecayFees", () => {
  describe("calculateTransactionSize", () => {
    test.each(txSizeCases)(
      "inputs=%i, outputs=%i => %i bytes",
      (inputs: number, outputs: number, expectedSize: number) => {
        const size = feeCalculator.calculateTransactionSize(inputs, outputs)
        expect(size).toBe(expectedSize)
      },
    )
  })

  describe("expDecayFee", () => {
    describe("Tier #1 (Fast)", () => {
      test.each(feeCapCasesMock.tier1)(
        "Tier1: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        ({ satsAmount, feeRate, expectedSats }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
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
        ({ satsAmount, feeRate, expectedSats }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
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
        ({ satsAmount, feeRate, expectedSats }) => {
          const { totalFee } = feeCalculator.expDecayFee({
            amount: { amount: BigInt(satsAmount), currency: WalletCurrency.Btc },
            speed: PayoutSpeed.Slow,
            feeRate,
          })
          expect(totalFee.amount).toEqual(BigInt(expectedSats))
        },
      )
    })
  })

  describe("calculateCostToBank", () => {
    describe("Tier #1 & #2 (Fast & Medium)", () => {
      const cases = costToBankCasesMock.tier1_2

      test.each(cases)(
        "amount=$satsAmount sats, feeRate=$feeRate => costToBank $expectedCost sats",
        ({ satsAmount, feeRate, expectedCost }) => {
          expect(
            feeCalculator.calculateCostToBank(satsAmount, PayoutSpeed.Fast, feeRate),
          ).toBe(expectedCost)
          expect(
            feeCalculator.calculateCostToBank(satsAmount, PayoutSpeed.Medium, feeRate),
          ).toBe(expectedCost)
        },
      )
    })

    describe("Tier #3 (Slow)", () => {
      const cases = costToBankCasesMock.tier3

      test.each(cases)(
        "amount=$satsAmount sats, feeRate=$feeRate => costToBank $expectedCost sats",
        ({ satsAmount, feeRate, expectedCost }) => {
          expect(
            feeCalculator.calculateCostToBank(satsAmount, PayoutSpeed.Slow, feeRate),
          ).toBe(expectedCost)
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
            feeCalculator.calculateBaseMultiplier(PayoutSpeed.Fast, feeRate),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier #2 (Medium)", () => {
      test.each(multiplierCasesMock.tier2)(
        "Medium, feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            feeCalculator.calculateBaseMultiplier(PayoutSpeed.Medium, feeRate),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })

    describe("Tier #3 (Slow)", () => {
      test.each(multiplierCasesMock.tier3)(
        "Slow, feeRate=$feeRate => multiplier $expectedMultiplier",
        ({ feeRate, expectedMultiplier }) => {
          expect(
            feeCalculator.calculateBaseMultiplier(PayoutSpeed.Slow, feeRate),
          ).toBeCloseTo(expectedMultiplier, 6)
        },
      )
    })
  })
})
