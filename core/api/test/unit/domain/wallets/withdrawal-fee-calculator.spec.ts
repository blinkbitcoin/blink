import { PayoutSpeed } from "@/domain/bitcoin/onchain"
import { WalletCurrency } from "@/domain/shared"
import { OnChainFees } from "@/domain/wallets"

import { generateTxSizeCases } from "test/helpers/withdrawal-fee-calculator"
import {
  costToBankCasesMock,
  feeCapCasesMock,
  onchainFeeSettingsMock,
  TRANSACTION_SIZE_MATRIX,
} from "test/mocks/withdrawal-fee-calculator"

const minerZeroFee = { amount: 0n, currency: WalletCurrency.Btc }

const txSizeCases = generateTxSizeCases(TRANSACTION_SIZE_MATRIX)
const feeCalculator = OnChainFees({
  onchain: onchainFeeSettingsMock,
})

describe("OnChainFees", () => {
  describe("calculateTransactionSize", () => {
    test.each(txSizeCases)(
      "inputs=%i, outputs=%i => %i bytes",
      (inputs: number, outputs: number, expectedSize: number) => {
        const size = feeCalculator.calculateTransactionSize(inputs, outputs)
        expect(size).toBe(expectedSize)
      },
    )
  })

  describe("withdrawalFee", () => {
    describe("Tier #1 (Fast)", () => {
      test.each(feeCapCasesMock.tier1)(
        "Tier1: amount=$satsAmount sats, feeRate=$feeRate => bankFee $expectedSats sats",
        ({ satsAmount, feeRate, expectedSats }) => {
          const { totalFee } = feeCalculator.withdrawalFee({
            minerFee: minerZeroFee,
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
          const { totalFee } = feeCalculator.withdrawalFee({
            minerFee: minerZeroFee,
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
          const { totalFee } = feeCalculator.withdrawalFee({
            minerFee: minerZeroFee,
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

  describe("onChainIntraLedgerFee", () => {
    it("always returns zero", async () => {
      const fee = feeCalculator.intraLedgerFees()
      expect(fee.btc.amount).toEqual(0n)
      expect(fee.usd.amount).toEqual(0n)
    })
  })
})
