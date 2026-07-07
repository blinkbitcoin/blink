jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getCustodialMigrationFlowConfig: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountById: jest.fn(),
    findFlowByAccountId: jest.fn(),
    upsertFlowByAccountId: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
    upsertByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.upsertFlowByAccountId,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
}))

import { startMigrationFlow } from "@/app/migration-flow/start-migration-flow"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import {
  CouldNotFindMigrationFlowStateError,
  InactiveAccountError,
} from "@/domain/errors"
import {
  MigrationDollarBalanceNotEmptyError,
  MigrationFlowDisabledError,
  MigrationFlowPhase,
} from "@/domain/migration-flow"
import { getCustodialMigrationFlowConfig } from "@/config"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  findFlowByAccountId: jest.Mock
  upsertFlowByAccountId: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
}
const mockGetConfig = getCustodialMigrationFlowConfig as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock

describe("startMigrationFlow", () => {
  const accountId = "account-id" as AccountId
  const account = { id: accountId, status: AccountStatus.Active } as Account
  const accountWallets = {
    BTC: { id: "btc-wallet-id" as WalletId },
    USD: { id: "usd-wallet-id" as WalletId },
  }
  const inProgressFlow = {
    accountId,
    phase: MigrationFlowPhase.InProgress,
    destinationProofVerified: false,
    steps: [],
  } as unknown as MigrationFlow

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetConfig.mockReturnValue({ enabled: true })
    mocks.findAccountById.mockResolvedValue(account)
    mocks.findFlowByAccountId.mockResolvedValue(
      new CouldNotFindMigrationFlowStateError(accountId),
    )
    mocks.findAccountWalletsByAccountId.mockResolvedValue(accountWallets)
    mockGetBalanceForWallet.mockResolvedValue(0)
    mocks.upsertFlowByAccountId.mockResolvedValue(inProgressFlow)
  })

  it("returns MigrationFlowDisabledError when the feature flag is off", async () => {
    mockGetConfig.mockReturnValue({ enabled: false })

    const result = await startMigrationFlow({ accountId })

    expect(result).toBeInstanceOf(MigrationFlowDisabledError)
    expect(mocks.findAccountById).not.toHaveBeenCalled()
    expect(mocks.upsertFlowByAccountId).not.toHaveBeenCalled()
  })

  it("returns InactiveAccountError for a non-active account", async () => {
    mocks.findAccountById.mockResolvedValue({
      id: accountId,
      status: AccountStatus.Locked,
    } as Account)

    const result = await startMigrationFlow({ accountId })

    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(mocks.upsertFlowByAccountId).not.toHaveBeenCalled()
  })

  it("returns MigrationDollarBalanceNotEmptyError when the usd wallet is not empty", async () => {
    mockGetBalanceForWallet.mockResolvedValue(150)

    const result = await startMigrationFlow({ accountId })

    expect(result).toBeInstanceOf(MigrationDollarBalanceNotEmptyError)
    expect(mockGetBalanceForWallet).toHaveBeenCalledWith({
      walletId: accountWallets.USD.id,
    })
    expect(mocks.upsertFlowByAccountId).not.toHaveBeenCalled()
  })

  it("creates an IN_PROGRESS migration flow for an eligible account", async () => {
    const result = await startMigrationFlow({ accountId })

    expect(result).toBe(inProgressFlow)
    expect(mocks.upsertFlowByAccountId).toHaveBeenCalledTimes(1)
    expect(mocks.upsertFlowByAccountId).toHaveBeenCalledWith({
      accountId,
      phase: MigrationFlowPhase.InProgress,
    })
  })

  it("attaches to the existing migration on a second start instead of forking", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(inProgressFlow)

    const result = await startMigrationFlow({ accountId })

    expect(result).toBe(inProgressFlow)
    expect(mocks.upsertFlowByAccountId).not.toHaveBeenCalled()
  })

  it("attaches to a transferring migration on a late second start", async () => {
    const transferringFlow = {
      ...inProgressFlow,
      phase: MigrationFlowPhase.Transferring,
      lnPaymentHash: "payment-hash" as PaymentHash,
    } as MigrationFlow
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)

    const result = await startMigrationFlow({ accountId })

    expect(result).toBe(transferringFlow)
    expect(mocks.upsertFlowByAccountId).not.toHaveBeenCalled()
  })
})
