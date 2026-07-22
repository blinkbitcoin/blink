jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
}))

jest.mock("@/app/migration-flow/reclaim-top-up", () => ({
  reclaimMigrationTopUp: jest.fn(),
}))

jest.mock("@/app/migration-flow/check-deposit-hold", () => ({
  checkDepositHold: jest.fn(),
}))

jest.mock("@/app/migration-flow/settle-migration-flow", () => ({
  completeMigrationFlowForSettledPayment: jest.fn(),
}))

jest.mock("@/app/payments/send-intraledger", () => ({
  intraledgerPaymentSendWalletIdForBtcWallet: jest.fn(),
}))

jest.mock("@/app/payments/send-lightning", () => ({
  payNoAmountInvoiceByWalletId: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountWallets: jest.fn(),
    findAccountById: jest.fn(),
    findMigrationFlow: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findMigrationFlow,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWallets,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { checkDepositHold } from "@/app/migration-flow/check-deposit-hold"
import { migrationDrainAmount } from "@/app/migration-flow/execute-transfer"
import { getMigrationPreview } from "@/app/migration-flow/get-migration-preview"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { getCustodialMigrationFlowConfig } from "@/config"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { MigrationOnHoldError } from "@/domain/migration-flow"
import { toSats } from "@/domain/bitcoin"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountWallets: jest.Mock
  findAccountById: jest.Mock
  findMigrationFlow: jest.Mock
}
const mockGetBalance = getBalanceForWallet as jest.Mock
const mockGetConfig = getCustodialMigrationFlowConfig as jest.Mock
const mockCheckDepositHold = checkDepositHold as jest.Mock

const accountId = "account-id" as AccountId
const btcWalletId = "btc-wallet-id" as WalletId

beforeEach(() => {
  jest.clearAllMocks()
  mocks.findAccountWallets.mockResolvedValue({
    BTC: { id: btcWalletId, currency: "BTC", accountId },
    USD: { id: "usd-wallet-id" as WalletId, currency: "USD", accountId },
  })
  mockGetConfig.mockReturnValue({
    enabled: true,
    deMinimisThresholdSats: 100,
    recentDepositThresholdUsdCents: 0,
    recentDepositWindowDays: 30,
  })
  mocks.findMigrationFlow.mockResolvedValue(
    new CouldNotFindMigrationFlowStateError(accountId),
  )
})

const previewFor = async (balance: number) => {
  mockGetBalance.mockResolvedValue(balance)
  const result = await getMigrationPreview({ accountId })
  if (result instanceof Error) throw result
  return result
}

describe("getMigrationPreview", () => {
  it("returns a zero preview for an empty wallet (B = 0)", async () => {
    const preview = await previewFor(0)
    expect(preview).toEqual({
      balanceSats: 0,
      feeSats: 0,
      feeCoveredByBlink: false,
      receiveSats: 0,
      onHold: false,
    })
  })

  it("covers the fee at the threshold and charges it just above (B = 100 vs 101)", async () => {
    const atThreshold = await previewFor(100)
    expect(atThreshold).toEqual({
      balanceSats: 100,
      feeSats: 10,
      feeCoveredByBlink: true,
      receiveSats: 100,
      onHold: false,
    })

    const aboveThreshold = await previewFor(101)
    expect(aboveThreshold).toEqual({
      balanceSats: 101,
      feeSats: 10,
      feeCoveredByBlink: false,
      receiveSats: 91,
      onHold: false,
    })
  })

  it("shows the true reserve on a skipped balance (B = 2111)", async () => {
    const preview = await previewFor(2111)
    expect(preview).toEqual({
      balanceSats: 2111,
      feeSats: 10,
      feeCoveredByBlink: false,
      receiveSats: 2101,
      onHold: false,
    })
  })

  it("charges the reserve in the normal range (B = 100000)", async () => {
    const drain = migrationDrainAmount(100_000n)
    if (drain instanceof Error) throw drain

    const preview = await previewFor(100_000)
    expect(preview).toEqual({
      balanceSats: 100_000,
      feeSats: Number(100_000n - drain),
      feeCoveredByBlink: false,
      receiveSats: Number(drain),
      onHold: false,
    })
  })

  it("holds receiveSats + (feeCoveredByBlink ? 0 : feeSats) === balanceSats across a sweep", async () => {
    const balances = [
      0, 1, 10, 11, 50, 99, 100, 101, 500, 2110, 2111, 5000, 100_000, 10_000_000,
    ]
    for (const balance of balances) {
      const preview = await previewFor(balance)
      const userPaidFee = preview.feeCoveredByBlink ? 0 : preview.feeSats
      expect(preview.receiveSats + userPaidFee).toBe(preview.balanceSats)
      expect(preview.balanceSats).toBe(balance)
    }
  })

  it("skips the hold machinery entirely when the gate is disabled", async () => {
    const preview = await previewFor(2111)

    expect(preview.onHold).toBe(false)
    expect(mocks.findAccountById).not.toHaveBeenCalled()
    expect(mockCheckDepositHold).not.toHaveBeenCalled()
  })

  it("reports onHold with the fee fields intact when the gate blocks", async () => {
    mockGetConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
      recentDepositThresholdUsdCents: 1000,
      recentDepositWindowDays: 30,
    })
    mocks.findAccountById.mockResolvedValue({ id: accountId } as Account)
    mockCheckDepositHold.mockResolvedValue(new MigrationOnHoldError())

    const preview = await previewFor(2111)

    expect(preview.onHold).toBe(true)
    expect(preview.receiveSats).toBe(2101)
  })

  it("evaluates against the pinned threshold when a flow record exists", async () => {
    mockGetConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
      recentDepositThresholdUsdCents: 1000,
      recentDepositWindowDays: 30,
    })
    mocks.findAccountById.mockResolvedValue({ id: accountId } as Account)
    mocks.findMigrationFlow.mockResolvedValue({
      accountId,
      holdThresholdSats: toSats(7_000),
    })
    mockCheckDepositHold.mockResolvedValue({ holdThresholdSats: toSats(7_000) })

    const preview = await previewFor(2111)

    expect(preview.onHold).toBe(false)
    expect(mockCheckDepositHold).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedThresholdSats: toSats(7_000) }),
    )
  })

  it("propagates a non-hold checker error instead of masking it", async () => {
    mockGetConfig.mockReturnValue({
      enabled: true,
      deMinimisThresholdSats: 100,
      recentDepositThresholdUsdCents: 1000,
      recentDepositWindowDays: 30,
    })
    mocks.findAccountById.mockResolvedValue({ id: accountId } as Account)
    const error = new Error("ledger down")
    mockCheckDepositHold.mockResolvedValue(error)
    mockGetBalance.mockResolvedValue(2111)

    const result = await getMigrationPreview({ accountId })

    expect(result).toBe(error)
  })
})
