jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getDefaultAccountsConfig: jest.fn(),
}))

jest.mock("@/app/merchants", () => ({
  deleteMerchantByUsername: jest.fn(),
}))

jest.mock("@/app/wallets", () => ({
  getBalanceForWallet: jest.fn(),
  listWalletsByAccountId: jest.fn(),
}))

jest.mock("@/services/kratos", () => ({
  __mocks: {
    deleteIdentity: jest.fn(),
  },
  IdentityRepository: () => ({
    deleteIdentity: jest.requireMock("@/services/kratos").__mocks.deleteIdentity,
  }),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findAccountById: jest.fn(),
    updateAccount: jest.fn(),
    findUserById: jest.fn(),
    findByDeletedPhones: jest.fn(),
    updateUser: jest.fn(),
    findFlowByAccountId: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
    update: jest.requireMock("@/services/mongoose").__mocks.updateAccount,
  }),
  UsersRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findUserById,
    findByDeletedPhones:
      jest.requireMock("@/services/mongoose").__mocks.findByDeletedPhones,
    update: jest.requireMock("@/services/mongoose").__mocks.updateUser,
  }),
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addEventToCurrentSpan: jest.fn(),
}))

import { markAccountForDeletion } from "@/app/accounts/mark-account-for-deletion"
import { deleteMerchantByUsername } from "@/app/merchants"
import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"
import { getDefaultAccountsConfig } from "@/config"
import { AccountStatus, InvalidAccountForDeletionError } from "@/domain/accounts"
import {
  CouldNotFindMigrationFlowStateError,
  InactiveAccountError,
  UnknownRepositoryError,
} from "@/domain/errors"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findAccountById: jest.Mock
  updateAccount: jest.Mock
  findUserById: jest.Mock
  findByDeletedPhones: jest.Mock
  updateUser: jest.Mock
  findFlowByAccountId: jest.Mock
}
const kratosMocks = jest.requireMock("@/services/kratos").__mocks as {
  deleteIdentity: jest.Mock
}
const mockGetDefaultAccountsConfig = getDefaultAccountsConfig as jest.Mock
const mockDeleteMerchantByUsername = deleteMerchantByUsername as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockListWalletsByAccountId = listWalletsByAccountId as jest.Mock

describe("markAccountForDeletion", () => {
  const accountId = "account-id" as AccountId
  const kratosUserId = "kratos-user-id" as UserId
  const phone = "+31612345678" as PhoneNumber
  const username = "merchant_user" as Username

  const baseAccount = {
    id: accountId,
    kratosUserId,
    status: AccountStatus.Active,
    statusHistory: [],
    username,
  } as unknown as Account

  const lnAddressStep = (detail: string): MigrationFlowStep => ({
    step: "ln-address-transfer",
    recordedAt: new Date(),
    detail,
  })

  const completedFlow = {
    accountId,
    phase: MigrationFlowPhase.Completed,
    steps: [lnAddressStep(`${username}: TRANSFERRED (${username}@blink.sv)`)],
  } as MigrationFlow

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDefaultAccountsConfig.mockReturnValue({ maxDeletions: 2 })
    mocks.findAccountById.mockResolvedValue({ ...baseAccount })
    mocks.updateAccount.mockResolvedValue({ ...baseAccount })
    mocks.findUserById.mockResolvedValue({ id: kratosUserId, phone })
    mocks.findByDeletedPhones.mockResolvedValue([])
    mocks.updateUser.mockResolvedValue({ id: kratosUserId })
    mocks.findFlowByAccountId.mockResolvedValue(
      new CouldNotFindMigrationFlowStateError(accountId),
    )
    kratosMocks.deleteIdentity.mockResolvedValue(undefined)
    mockDeleteMerchantByUsername.mockResolvedValue([])
    mockListWalletsByAccountId.mockResolvedValue([
      { id: "btc-wallet-id", currency: "BTC" },
    ])
    mockGetBalanceForWallet.mockResolvedValue(0)
  })

  it("deletes a Migrated account with a completed flow and keeps the merchant", async () => {
    mocks.findAccountById.mockResolvedValue({
      ...baseAccount,
      status: AccountStatus.Migrated,
    })
    mocks.findFlowByAccountId.mockResolvedValue(completedFlow)

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).not.toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone: undefined, deletedPhones: [phone] }),
    )
    expect(mocks.updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        statusHistory: expect.arrayContaining([
          expect.objectContaining({ status: AccountStatus.Closed }),
        ]),
      }),
    )
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it("deletes the merchant for a Migrated account with no flow record", async () => {
    mocks.findAccountById.mockResolvedValue({
      ...baseAccount,
      status: AccountStatus.Migrated,
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).toHaveBeenCalledWith({ username })
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it.each([
    AccountStatus.New,
    AccountStatus.Pending,
    AccountStatus.Locked,
    AccountStatus.Closed,
  ])("refuses a %s account", async (status) => {
    mocks.findAccountById.mockResolvedValue({ ...baseAccount, status })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBeInstanceOf(InactiveAccountError)
    expect(mocks.findFlowByAccountId).not.toHaveBeenCalled()
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).not.toHaveBeenCalled()
  })

  it("allows an Invited account", async () => {
    mocks.findAccountById.mockResolvedValue({
      ...baseAccount,
      status: AccountStatus.Invited,
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it("refuses deletion while a migration transfer is in flight", async () => {
    mocks.findFlowByAccountId.mockResolvedValue({
      ...completedFlow,
      phase: MigrationFlowPhase.Transferring,
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.updateAccount).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).not.toHaveBeenCalled()
  })

  it("returns an unexpected migration-flow repository error", async () => {
    const repoError = new UnknownRepositoryError("mongo down")
    mocks.findFlowByAccountId.mockResolvedValue(repoError)

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(repoError)
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).not.toHaveBeenCalled()
  })

  it("keeps the merchant for an Active account whose username transferred to Spark", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(completedFlow)

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it("deletes the merchant when the username transfer recorded FAILED", async () => {
    mocks.findAccountById.mockResolvedValue({
      ...baseAccount,
      status: AccountStatus.Migrated,
    })
    mocks.findFlowByAccountId.mockResolvedValue({
      ...completedFlow,
      steps: [lnAddressStep(`${username}: FAILED`)],
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).toHaveBeenCalledWith({ username })
  })

  it("deletes the merchant when only the phone identifier transferred", async () => {
    mocks.findAccountById.mockResolvedValue({
      ...baseAccount,
      status: AccountStatus.Migrated,
    })
    mocks.findFlowByAccountId.mockResolvedValue({
      ...completedFlow,
      steps: [lnAddressStep(`${phone}: TRANSFERRED`)],
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).toHaveBeenCalledWith({ username })
  })

  it("keeps the merchant for an IN_PROGRESS flow with a recorded username transfer", async () => {
    mocks.findFlowByAccountId.mockResolvedValue({
      ...completedFlow,
      phase: MigrationFlowPhase.InProgress,
      steps: [lnAddressStep(`${username}: ALREADY_TRANSFERRED`)],
    })

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it("deletes the merchant for an Active account with no flow", async () => {
    const result = await markAccountForDeletion({ accountId })

    expect(result).toBe(true)
    expect(mockDeleteMerchantByUsername).toHaveBeenCalledWith({ username })
    expect(kratosMocks.deleteIdentity).toHaveBeenCalledWith(kratosUserId)
  })

  it("refuses when the phone deletion cap is reached", async () => {
    mockGetDefaultAccountsConfig.mockReturnValue({ maxDeletions: 2 })
    mocks.findByDeletedPhones.mockResolvedValue([{ id: "user-1" }, { id: "user-2" }])

    const result = await markAccountForDeletion({ accountId })

    expect(result).toBeInstanceOf(InvalidAccountForDeletionError)
    expect(mocks.updateUser).not.toHaveBeenCalled()
    expect(mocks.updateAccount).not.toHaveBeenCalled()
    expect(kratosMocks.deleteIdentity).not.toHaveBeenCalled()
  })
})
