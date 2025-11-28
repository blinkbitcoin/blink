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

import { DepositFeeCalculator } from "@/domain/fees"

describe("DepositFeeCalculator", () => {
  const btcPaymentAmount = paymentAmountFromNumber({
    amount: 100000,
    currency: WalletCurrency.Btc,
  })
  if (btcPaymentAmount instanceof Error) throw btcPaymentAmount

  const accountId = "accountId1" as AccountId
  const wallet = {} as Wallet

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe("onChainFee", () => {
    it("should return a flat fee", async () => {
      const { getOnchainNetworkConfig } = jest.requireActual("@/config")
      mockGetOnchainNetworkConfig.mockReturnValue({
        ...getOnchainNetworkConfig(),
        receive: {
          feeStrategies: [{ name: "Flat", strategy: "flat", params: { amount: 50 } }],
        },
      })

      const fee = await DepositFeeCalculator().onChainFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        isValidatedMerchant: false,
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(50n)
    })
  })

  describe("lightningFee", () => {
    it("should return a percentage fee", async () => {
      const { getLightningNetworkConfig } = jest.requireActual("@/config")
      mockGetLightningNetworkConfig.mockReturnValue({
        ...getLightningNetworkConfig(),
        channels: {
          backupBucketName: "",
          scanDepthChannelUpdate: 0 as ScanDepth,
        },
        receive: {
          addressDomain: "",
          addressDomainAliases: [],
          feeStrategies: [
            { name: "Percentage", strategy: "percentage", params: { basisPoints: 100 } },
          ],
        },
        send: {
          feeStrategies: [],
          skipFeeProbe: {
            pubkeys: [],
            chanIds: [],
          },
        },
      })

      const fee = await DepositFeeCalculator().lightningFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        isValidatedMerchant: false,
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(1000n)
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

      const fee = await DepositFeeCalculator().intraledgerFee({
        paymentAmount: btcPaymentAmount,
        accountId,
        wallet,
        isValidatedMerchant: false,
      })

      expect(fee).not.toBeInstanceOf(Error)
      if (fee instanceof Error) throw fee
      expect(fee.totalFee.amount).toBe(0n)
    })
  })
})
