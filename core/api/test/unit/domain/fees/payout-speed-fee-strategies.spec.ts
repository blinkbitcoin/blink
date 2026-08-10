import { getOnchainNetworkConfig } from "@/config"

import { WithdrawalFeeCalculator } from "@/domain/fees"
import { WalletCurrency, paymentAmountFromNumber } from "@/domain/shared"

const payoutSpeeds = getOnchainNetworkConfig().send.payoutSpeeds

const totalFeeForSpeed = async ({
  satsAmount,
  minerFee,
  feeRate,
  speed,
}: {
  satsAmount: number
  minerFee: number
  feeRate: number
  speed: PayoutSpeed
}) => {
  const paymentAmount = paymentAmountFromNumber({
    amount: satsAmount,
    currency: WalletCurrency.Btc,
  })
  if (paymentAmount instanceof Error) throw paymentAmount

  const networkFeeAmount = paymentAmountFromNumber({
    amount: minerFee,
    currency: WalletCurrency.Btc,
  })
  if (networkFeeAmount instanceof Error) throw networkFeeAmount

  const fee = await WithdrawalFeeCalculator().onChainFee({
    paymentAmount,
    accountId: "accountId1" as AccountId,
    wallet: {
      id: "walletId1" as WalletId,
      currency: WalletCurrency.Btc,
      accountId: "accountId1" as AccountId,
    },
    networkFee: { amount: networkFeeAmount, feeRate },
    speed,
  })
  if (fee instanceof Error) throw fee

  return fee.totalFee.amount
}

describe("payout speed fee strategies", () => {
  describe("config wiring", () => {
    it("resolves a distinct exponential decay strategy per payout speed", () => {
      expect(payoutSpeeds.fast.feeStrategies[0].name).toEqual(
        "exponential_decay_fast",
      )
      expect(payoutSpeeds.medium.feeStrategies[0].name).toEqual(
        "exponential_decay_medium",
      )
      expect(payoutSpeeds.slow.feeStrategies[0].name).toEqual(
        "exponential_decay_slow",
      )
    })
  })

  describe("onChainFee", () => {
    // Even when all queue priorities resolve to the same network fee rate
    // (e.g. the 1 sat/vB floor on an empty mempool), tracks must differ.
    test.each([100_000, 10_000_000])(
      "charges fast > medium > slow for %i sats at the 1 sat/vB fee floor",
      async (satsAmount) => {
        const args = { satsAmount, minerFee: 200, feeRate: 1 }

        const fastFee = await totalFeeForSpeed({ ...args, speed: "fast" })
        const mediumFee = await totalFeeForSpeed({ ...args, speed: "medium" })
        const slowFee = await totalFeeForSpeed({ ...args, speed: "slow" })

        expect(fastFee).toBeGreaterThan(mediumFee)
        expect(mediumFee).toBeGreaterThan(slowFee)
      },
    )
  })
})
