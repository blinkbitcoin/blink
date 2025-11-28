import { WalletCurrency, paymentAmountFromNumber } from "@/domain/shared"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getOnchainNetworkConfig: jest.fn(),
  getLightningNetworkConfig: jest.fn(),
  getIntraledgerNetworkConfig: jest.fn(),
}))

import {
  getOnchainNetworkConfig,
  getLightningNetworkConfig,
  getIntraledgerNetworkConfig,
} from "@/config"

const mockGetOnchainNetworkConfig = getOnchainNetworkConfig as jest.MockedFunction<
  typeof getOnchainNetworkConfig
>

const mockGetLightningNetworkConfig = getLightningNetworkConfig as jest.MockedFunction<
  typeof getLightningNetworkConfig
>

const mockGetIntraledgerNetworkConfig =
  getIntraledgerNetworkConfig as jest.MockedFunction<typeof getIntraledgerNetworkConfig>

import { WithdrawalFeeCalculator } from "@/domain/fees"
import { WalletPriceRatio } from "@/domain/payments"

describe("WithdrawalFeeCalculator", () => {
  const btcPaymentAmount = paymentAmountFromNumber({
    amount: 100000,
    currency: WalletCurrency.Btc,
  })
  if (btcPaymentAmount instanceof Error) throw btcPaymentAmount

  const networkFee = paymentAmountFromNumber({
    amount: 2000,
    currency: WalletCurrency.Btc,
  })
  if (networkFee instanceof Error) throw networkFee

  const accountId = "accountId1" as AccountId
  const wallet = {} as Wallet

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("onChainFee", () => {
    it("should return a flat fee for fast speed", async () => {
      const { getOnchainNetworkConfig } = jest.requireActual("@/config")
      mockGetOnchainNetworkConfig.mockReturnValue({
        ...getOnchainNetworkConfig(),
        send: {
          payoutSpeeds: {
            fast: {
              feeStrategies: [
                { name: "Flat", strategy: "flat", params: { amount: 500 } },
              ],
            },
            medium: { feeStrategies: [] },
            slow: { feeStrategies: [] },
          },
        },
      })

      const fee = await WithdrawalFeeCalculator().onChainFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        networkFee: { amount: networkFee },
        speed: "fast",
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(2500n)
    })

    describe("Imbalance Fee Strategy (On-chain values)", () => {
      const thresholdImbalanceAmount = BigInt(1_000_000)
      const feeRatioAsBasisPoints = 50n
      const minBankFeeAmount = BigInt(2000)

      const mockNetInVolumeAmountInboundNetworkFn = jest.fn()
      const mockNetInVolumeAmountOutboundNetworkFn = jest.fn()

      const priceRatio = WalletPriceRatio({
        usd: { amount: 100_000n, currency: WalletCurrency.Usd },
        btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
      })
      if (priceRatio instanceof Error) throw priceRatio

      const createImbalanceFns = (
        inboundSats: bigint,
        outboundSats: bigint,
      ): ImbalanceFns => {
        mockNetInVolumeAmountInboundNetworkFn.mockResolvedValueOnce({
          amount: inboundSats,
          currency: WalletCurrency.Btc,
        })
        mockNetInVolumeAmountOutboundNetworkFn.mockResolvedValueOnce({
          amount: outboundSats,
          currency: WalletCurrency.Btc,
        })

        return {
          netInVolumeAmountInboundNetworkFn: mockNetInVolumeAmountInboundNetworkFn,
          netInVolumeAmountOutboundNetworkFn: mockNetInVolumeAmountOutboundNetworkFn,
          priceRatio,
        }
      }

      beforeEach(() => {
        mockNetInVolumeAmountOutboundNetworkFn.mockReset()
        mockNetInVolumeAmountInboundNetworkFn.mockReset()

        const { getOnchainNetworkConfig } = jest.requireActual("@/config")
        mockGetOnchainNetworkConfig.mockReturnValue({
          ...getOnchainNetworkConfig(),
          send: {
            payoutSpeeds: {
              fast: {
                feeStrategies: [
                  {
                    name: "Imbalance",
                    strategy: "imbalance",
                    params: {
                      threshold: Number(thresholdImbalanceAmount),
                      ratioAsBasisPoints: Number(feeRatioAsBasisPoints),
                      daysLookback: 30,
                      minFee: Number(minBankFeeAmount),
                    },
                  },
                ],
              },
              medium: { feeStrategies: [] },
              slow: { feeStrategies: [] },
            },
          },
        })
      })

      it("returns flat fee for no tx", async () => {
        const amount = paymentAmountFromNumber({
          amount: 1_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(0n, 0n),
        })
        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        expect(fee.bankFee.amount).toEqual(minBankFeeAmount)
      })

      it("returns flat fee for loop in imbalance and small amount", async () => {
        const amount = paymentAmountFromNumber({
          amount: 1_000_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(0n, 2_000_000n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        expect(fee.bankFee.amount).toEqual(minBankFeeAmount)
      })

      it("returns flat fee for loop out imbalance below threshold, low amount", async () => {
        const amount = paymentAmountFromNumber({
          amount: 250_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(500_000n, 0n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        expect(fee.bankFee.amount).toEqual(minBankFeeAmount)
      })

      it("returns proportional fee for loop in imbalance and large amount", async () => {
        const amount = paymentAmountFromNumber({
          amount: 100_000_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(0n, 2_000_000n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee

        const calculatedImbalanceForTest =
          ((amount.amount + -2_000_000n - thresholdImbalanceAmount) *
            feeRatioAsBasisPoints) /
          10000n
        expect(fee.bankFee.amount).toEqual(calculatedImbalanceForTest)
      })

      it("returns proportional fee for small loop out imbalance and large amount", async () => {
        const amount = paymentAmountFromNumber({
          amount: 10_000_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(500_000n, 0n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        const calculatedAmountForTest =
          (BigInt(9_500_000) * feeRatioAsBasisPoints) / 10000n
        expect(fee.bankFee.amount).toEqual(calculatedAmountForTest)
      })

      it("returns proportional fee for loop out imbalance above threshold, amount < imbalance", async () => {
        const amount = paymentAmountFromNumber({
          amount: 500_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(2_000_000n, 0n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        const calculatedAmountForTest = (amount.amount * feeRatioAsBasisPoints) / 10000n
        expect(fee.bankFee.amount).toEqual(calculatedAmountForTest)
      })

      it("returns proportional fee for loop out imbalance above threshold, amount > imbalance", async () => {
        const amount = paymentAmountFromNumber({
          amount: 10_000_000,
          currency: WalletCurrency.Btc,
        })
        if (amount instanceof Error) throw amount

        const fee = await WithdrawalFeeCalculator().onChainFee({
          paymentAmount: amount,
          accountId,
          wallet,
          networkFee: { amount: networkFee },
          speed: "fast",
          imbalanceFns: createImbalanceFns(2_000_000n, 0n),
        })

        expect(fee).not.toBeInstanceOf(Error)
        if (fee instanceof Error) throw fee
        const calculatedAmountForTest = (amount.amount * feeRatioAsBasisPoints) / 10000n
        expect(fee.bankFee.amount).toEqual(calculatedAmountForTest)
      })
    })
  })

  describe("lightningFee", () => {
    it("should return a percentage fee", async () => {
      const { getLightningNetworkConfig } = jest.requireActual("@/config")
      mockGetLightningNetworkConfig.mockReturnValue({
        ...getLightningNetworkConfig(),
        send: {
          feeStrategies: [
            { name: "Percentage", strategy: "percentage", params: { basisPoints: 100 } },
          ],
        },
      })

      const fee = await WithdrawalFeeCalculator().lightningFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        networkFee: { amount: networkFee },
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(3000n)
    })
  })

  describe("intraledgerFee", () => {
    it("should return zero fee", async () => {
      mockGetIntraledgerNetworkConfig.mockReturnValue({
        receive: {
          feeStrategies: [],
        },
        send: {
          feeStrategies: [],
        },
      })

      const fee = await WithdrawalFeeCalculator().intraledgerFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        networkFee: { amount: networkFee },
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(2000n)
    })
  })
})
