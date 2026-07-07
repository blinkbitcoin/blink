jest.mock("@/app/accounts/update-account-status", () => ({
  updateAccountStatus: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findFlowByLnPaymentHash: jest.fn(),
    updateFlowPhase: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
    findAccountById: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findAccountById,
  }),
  MigrationFlowStateRepository: () => ({
    findByLnPaymentHash:
      jest.requireMock("@/services/mongoose").__mocks.findFlowByLnPaymentHash,
    updatePhase: jest.requireMock("@/services/mongoose").__mocks.updateFlowPhase,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { updateAccountStatus } from "@/app/accounts/update-account-status"
import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "@/app/migration-flow/settle-migration-flow"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findFlowByLnPaymentHash: jest.Mock
  updateFlowPhase: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  findAccountById: jest.Mock
}
const mockUpdateAccountStatus = updateAccountStatus as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

describe("settle-migration-flow", () => {
  const accountId = "account-id" as AccountId
  const paymentHash = "payment-hash" as PaymentHash
  const transferringFlow = {
    accountId,
    phase: MigrationFlowPhase.Transferring,
    destinationProofVerified: true,
    lnPaymentHash: paymentHash,
    steps: [],
  } as unknown as MigrationFlow

  beforeEach(() => {
    jest.clearAllMocks()
    mocks.findFlowByLnPaymentHash.mockResolvedValue(transferringFlow)
    mocks.updateFlowPhase.mockResolvedValue({
      ...transferringFlow,
      phase: MigrationFlowPhase.Completed,
    })
    mocks.findAccountWalletsByAccountId.mockResolvedValue({
      BTC: { id: "btc-wallet-id" as WalletId },
      USD: { id: "usd-wallet-id" as WalletId },
    })
    mockGetBalanceForWallet.mockResolvedValue(0)
    mockUpdateAccountStatus.mockResolvedValue({ id: accountId } as Account)
    mocks.findAccountById.mockResolvedValue({
      id: accountId,
      status: AccountStatus.Migrated,
    } as Account)
  })

  describe("completeMigrationFlowForSettledPayment", () => {
    it("flips a matching TRANSFERRING flow to COMPLETED and soft-closes to Migrated", async () => {
      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          fromPhase: MigrationFlowPhase.Transferring,
          toPhase: MigrationFlowPhase.Completed,
        }),
      )
      expect(mockUpdateAccountStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          status: AccountStatus.Migrated,
        }),
      )
    })

    it("is a no-op for a hash with no matching migration", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue(
        new CouldNotFindMigrationFlowStateError(paymentHash),
      )

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
    })

    it("is a no-op when the flow is already COMPLETED and the account is Migrated", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Completed,
      })

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
    })

    it("retries the soft-close when the flow is COMPLETED but the account is not Migrated", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Completed,
      })
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Active,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          status: AccountStatus.Migrated,
        }),
      )
    })

    it("completes a FAILED flow and soft-closes when the payment settles late", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Failed,
      })
      mocks.updateFlowPhase.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Completed,
      })

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          fromPhase: MigrationFlowPhase.Failed,
          toPhase: MigrationFlowPhase.Completed,
        }),
      )
      expect(mockUpdateAccountStatus).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          status: AccountStatus.Migrated,
        }),
      )
    })

    it("does not soft-close twice when the CAS loses the race", async () => {
      mocks.updateFlowPhase.mockResolvedValue(
        new MigrationStateConflictError("already completed"),
      )

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalled()
    })

    it("swallows repository exceptions", async () => {
      mocks.findFlowByLnPaymentHash.mockRejectedValue(new Error("mongo down"))

      await expect(
        completeMigrationFlowForSettledPayment({ paymentHash }),
      ).resolves.toBeUndefined()

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalled()
    })

    it("records a critical exception when the soft-close fails but does not throw", async () => {
      const softCloseError = new Error("status update failed")
      mockUpdateAccountStatus.mockResolvedValue(softCloseError)

      await expect(
        completeMigrationFlowForSettledPayment({ paymentHash }),
      ).resolves.toBeUndefined()

      expect(mockRecordException).toHaveBeenCalledWith(
        expect.objectContaining({ error: softCloseError, level: ErrorLevel.Critical }),
      )
    })
  })

  describe("failMigrationFlowForFailedPayment", () => {
    it("flips a matching TRANSFERRING flow to FAILED without soft-closing", async () => {
      mocks.updateFlowPhase.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Failed,
      })

      await failMigrationFlowForFailedPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId,
          fromPhase: MigrationFlowPhase.Transferring,
          toPhase: MigrationFlowPhase.Failed,
        }),
      )
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
    })

    it("is a no-op for a hash with no matching migration", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue(
        new CouldNotFindMigrationFlowStateError(paymentHash),
      )

      await failMigrationFlowForFailedPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    })

    it("is a no-op when the flow is already FAILED", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Failed,
      })

      await failMigrationFlowForFailedPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
    })

    it("swallows repository exceptions", async () => {
      mocks.findFlowByLnPaymentHash.mockRejectedValue(new Error("mongo down"))

      await expect(
        failMigrationFlowForFailedPayment({ paymentHash }),
      ).resolves.toBeUndefined()

      expect(mockRecordException).toHaveBeenCalled()
    })
  })
})
