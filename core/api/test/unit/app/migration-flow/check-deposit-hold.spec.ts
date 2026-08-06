jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
}))

jest.mock("@/app/prices", () => ({
  getCurrentPriceAsWalletPriceRatio: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/app/wind-down", () => ({
  isAccountInWindDownCohort: jest.fn(),
}))

jest.mock("@/services/ledger/facade", () => ({
  inAllTxBaseVolumeAmountSince: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { checkDepositHold } from "@/app/migration-flow/check-deposit-hold"
import { getCurrentPriceAsWalletPriceRatio } from "@/app/prices"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { isAccountInWindDownCohort } from "@/app/wind-down"
import { getCustodialMigrationFlowConfig } from "@/config"
import { toSats } from "@/domain/bitcoin"
import { UnknownRepositoryError } from "@/domain/errors"
import { UnknownLedgerError } from "@/domain/ledger"
import { MigrationOnHoldError } from "@/domain/migration-flow"
import { UnknownPriceServiceError } from "@/domain/price"
import { WalletCurrency } from "@/domain/shared"
import { inAllTxBaseVolumeAmountSince } from "@/services/ledger/facade"

const mockGetConfig = getCustodialMigrationFlowConfig as jest.Mock
const mockGetPriceRatio = getCurrentPriceAsWalletPriceRatio as jest.Mock
const mockGetBalance = getBalanceForWallet as jest.Mock
const mockIsInCohort = isAccountInWindDownCohort as jest.Mock
const mockInVolume = inAllTxBaseVolumeAmountSince as jest.Mock

const accountId = "account-id" as AccountId
const makeAccount = (level: number): Account =>
  ({ id: accountId, level: level as AccountLevel }) as Account

const btcWalletDescriptor = {
  id: "btc-wallet-id" as WalletId,
  currency: WalletCurrency.Btc,
} as WalletDescriptor<"BTC">

const satsPerCent = 10n
const priceRatio = {
  convertFromUsd: (usdAmount: UsdPaymentAmount) => ({
    amount: usdAmount.amount * satsPerCent,
    currency: WalletCurrency.Btc,
  }),
}

const volumeOf = (sats: bigint) =>
  mockInVolume.mockResolvedValue({ amount: sats, currency: WalletCurrency.Btc })

describe("checkDepositHold", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
      recentDepositThresholdUsdCents: 1000,
      recentDepositWindowDays: 30,
    })
    mockIsInCohort.mockResolvedValue(false)
    mockGetPriceRatio.mockResolvedValue(priceRatio)
    mockGetBalance.mockResolvedValue(50_000)
    volumeOf(0n)
  })

  it("short-circuits with zero lookups when the threshold is zero", async () => {
    mockGetConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
      recentDepositThresholdUsdCents: 0,
      recentDepositWindowDays: 30,
    })

    const result = await checkDepositHold({
      account: makeAccount(0),
      btcWalletDescriptor,
    })

    expect(result).toEqual({})
    expect(mockGetBalance).not.toHaveBeenCalled()
    expect(mockIsInCohort).not.toHaveBeenCalled()
    expect(mockInVolume).not.toHaveBeenCalled()
    expect(mockGetPriceRatio).not.toHaveBeenCalled()
  })

  it.each([2, 3])(
    "exempts a level-%i account before the cohort lookup",
    async (level) => {
      volumeOf(1_000_000n)

      const result = await checkDepositHold({
        account: makeAccount(level),
        btcWalletDescriptor,
      })

      expect(result).toEqual({})
      expect(mockGetBalance).not.toHaveBeenCalled()
      expect(mockIsInCohort).not.toHaveBeenCalled()
      expect(mockInVolume).not.toHaveBeenCalled()
      expect(mockGetPriceRatio).not.toHaveBeenCalled()
    },
  )

  it("exempts a zero-balance account before the cohort lookup", async () => {
    mockGetBalance.mockResolvedValue(0)
    volumeOf(1_000_000n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toEqual({})
    expect(mockGetBalance).toHaveBeenCalledWith({ walletId: btcWalletDescriptor.id })
    expect(mockIsInCohort).not.toHaveBeenCalled()
    expect(mockInVolume).not.toHaveBeenCalled()
    expect(mockGetPriceRatio).not.toHaveBeenCalled()
  })

  it("still applies the gate when the balance lookup errors", async () => {
    mockGetBalance.mockResolvedValue(new UnknownLedgerError("balance down"))
    volumeOf(20_000n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toBeInstanceOf(MigrationOnHoldError)
  })

  it("exempts a wind-down cohort member regardless of volume", async () => {
    mockIsInCohort.mockResolvedValue(true)
    volumeOf(1_000_000n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toEqual({})
    expect(mockInVolume).not.toHaveBeenCalled()
    expect(mockGetPriceRatio).not.toHaveBeenCalled()
  })

  it("still applies the gate when the cohort lookup errors", async () => {
    mockIsInCohort.mockResolvedValue(new UnknownRepositoryError("users down"))
    volumeOf(20_000n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toBeInstanceOf(MigrationOnHoldError)
  })

  it("holds when the window volume exceeds the threshold", async () => {
    volumeOf(10_001n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toBeInstanceOf(MigrationOnHoldError)
  })

  it("passes at exactly the threshold and pins the sats used", async () => {
    volumeOf(10_000n)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toEqual({ holdThresholdSats: 10_000 })
    expect(mockInVolume).toHaveBeenCalledWith(
      expect.objectContaining({ walletDescriptor: btcWalletDescriptor }),
    )

    const { timestamp } = mockInVolume.mock.calls[0][0]
    const expectedWindowStart = Date.now() - 30 * 24 * 60 * 60 * 1000
    expect(Math.abs(timestamp.getTime() - expectedWindowStart)).toBeLessThan(5_000)
  })

  it("converts the threshold at the current price when no pin is supplied", async () => {
    volumeOf(0n)

    const result = await checkDepositHold({
      account: makeAccount(0),
      btcWalletDescriptor,
    })

    expect(result).toEqual({ holdThresholdSats: 10_000 })
    expect(mockGetPriceRatio).toHaveBeenCalledTimes(1)
  })

  it("uses the pinned sats without a price lookup", async () => {
    volumeOf(5_000n)

    const blocked = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
      pinnedThresholdSats: toSats(4_000),
    })
    expect(blocked).toBeInstanceOf(MigrationOnHoldError)

    const passed = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
      pinnedThresholdSats: toSats(6_000),
    })
    expect(passed).toEqual({ holdThresholdSats: 6_000 })

    expect(mockGetPriceRatio).not.toHaveBeenCalled()
  })

  it("fails closed on a volume lookup error", async () => {
    const error = new UnknownLedgerError("ledger down")
    mockInVolume.mockResolvedValue(error)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toBe(error)
  })

  it("fails closed on a price lookup error", async () => {
    const error = new UnknownPriceServiceError("price down")
    mockGetPriceRatio.mockResolvedValue(error)

    const result = await checkDepositHold({
      account: makeAccount(1),
      btcWalletDescriptor,
    })

    expect(result).toBe(error)
    expect(mockInVolume).not.toHaveBeenCalled()
  })
})
