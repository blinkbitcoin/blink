jest.mock("@/app/accounts/update-account-status", () => ({
  updateAccountStatus: jest.fn(),
}))

jest.mock("@/app/migration-flow/reclaim-top-up", () => ({
  reclaimMigrationTopUp: jest.fn(),
}))

jest.mock("@/app/wallets/get-balance-for-wallet", () => ({
  getBalanceForWallet: jest.fn(),
}))

jest.mock("@/services/ledger", () => ({
  __mockGetTransactionsByHash: jest.fn(),
  LedgerService: () => ({
    getTransactionsByHash:
      jest.requireMock("@/services/ledger").__mockGetTransactionsByHash,
  }),
}))

jest.mock("@/services/lnd", () => ({
  __mockLookupPayment: jest.fn(),
  LndService: () => ({
    lookupPayment: jest.requireMock("@/services/lnd").__mockLookupPayment,
  }),
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
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
}))

import { updateAccountStatus } from "@/app/accounts/update-account-status"
import { reclaimMigrationTopUp } from "@/app/migration-flow/reclaim-top-up"
import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "@/app/migration-flow/settle-migration-flow"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"
import { AccountStatus } from "@/domain/accounts"
import { PaymentStatus } from "@/domain/bitcoin/lightning"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { LedgerTransactionType } from "@/domain/ledger"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findFlowByLnPaymentHash: jest.Mock
  updateFlowPhase: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
  findAccountById: jest.Mock
}
const mockGetTransactionsByHash = jest.requireMock("@/services/ledger")
  .__mockGetTransactionsByHash as jest.Mock
const mockLookupPayment = jest.requireMock("@/services/lnd")
  .__mockLookupPayment as jest.Mock
const mockUpdateAccountStatus = updateAccountStatus as jest.Mock
const mockGetBalanceForWallet = getBalanceForWallet as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock
const mockReclaimTopUp = reclaimMigrationTopUp as jest.Mock

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
  const settledPaymentTxn = ({
    voided = false,
    at = new Date("2026-01-01T00:00:00Z"),
  }: { voided?: boolean; at?: Date } = {}) =>
    ({
      type: LedgerTransactionType.Payment,
      pendingConfirmation: false,
      voided,
      debit: 1000,
      credit: 0,
      timestamp: at,
    }) as LedgerTransaction<WalletCurrency>
  const refusalRecord = expect.objectContaining({
    error: expect.objectContaining({
      message: expect.stringMatching(/refusing to complete migration/),
    }),
    level: ErrorLevel.Warn,
  })
  const softCloseSkipRecord = expect.objectContaining({
    error: expect.objectContaining({
      message: expect.stringMatching(/soft-close skipped/),
    }),
    level: ErrorLevel.Warn,
  })

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
    mockReclaimTopUp.mockResolvedValue(undefined)
    mocks.findAccountById.mockResolvedValue({
      id: accountId,
      status: AccountStatus.Active,
    } as Account)
    mockGetTransactionsByHash.mockResolvedValue([settledPaymentTxn()])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })
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

    it("refuses to complete when the latest ledger entry is voided", async () => {
      // the trigger's revert voids the journal before it writes the reversal
      mockGetTransactionsByHash.mockResolvedValue([settledPaymentTxn({ voided: true })])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(refusalRecord)
    })

    it("refuses to complete when the ledger shows the payment reverted", async () => {
      mockGetTransactionsByHash.mockResolvedValue([
        settledPaymentTxn({ voided: true, at: new Date("2026-01-01T00:01:00Z") }),
        {
          ...settledPaymentTxn({ at: new Date("2026-01-01T00:02:00Z") }),
          debit: 0,
          credit: 1000,
        },
      ])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(refusalRecord)
    })

    it("refuses to complete when lnd does not report the payment settled", async () => {
      mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Failed })

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(refusalRecord)
    })

    it("refuses to complete when there are no ledger entries for the hash", async () => {
      mockGetTransactionsByHash.mockResolvedValue([])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(refusalRecord)
    })

    it("refuses to complete when the ledger bundle cannot be classified", async () => {
      mockGetTransactionsByHash.mockResolvedValue([
        settledPaymentTxn({ at: new Date("2026-01-01T00:01:00Z") }),
        {
          ...settledPaymentTxn({ at: new Date("2026-01-01T00:02:00Z") }),
          pendingConfirmation: true,
        },
        {
          ...settledPaymentTxn({ at: new Date("2026-01-01T00:03:00Z") }),
          pendingConfirmation: true,
        },
      ])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(refusalRecord)
    })

    it("completes a zero-balance flow that skipped the transfer without any payment", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        steps: [{ step: "transfer-skipped", detail: "zero balance" }],
      })
      mockGetTransactionsByHash.mockResolvedValue([])
      mockLookupPayment.mockResolvedValue(new Error("payment not found"))

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
      expect(mockLookupPayment).not.toHaveBeenCalled()
      expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
        expect.objectContaining({ toPhase: MigrationFlowPhase.Completed }),
      )
    })

    it("completes a retried drain whose earlier attempt was voided", async () => {
      mockGetTransactionsByHash.mockResolvedValue([
        settledPaymentTxn({ voided: true, at: new Date("2026-01-01T00:01:00Z") }),
        {
          ...settledPaymentTxn({ at: new Date("2026-01-01T00:02:00Z") }),
          debit: 0,
          credit: 1000,
        },
        settledPaymentTxn({ at: new Date("2026-01-01T00:03:00Z") }),
      ])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledWith(
        expect.objectContaining({ toPhase: MigrationFlowPhase.Completed }),
      )
    })

    it("passes the ledger pubkey to the lnd lookup", async () => {
      mockGetTransactionsByHash.mockResolvedValue([
        { ...settledPaymentTxn(), pubkey: "node-pubkey" as Pubkey },
      ])

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mockLookupPayment).toHaveBeenCalledWith({
        pubkey: "node-pubkey",
        paymentHash,
      })
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
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Migrated,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).not.toHaveBeenCalledWith(softCloseSkipRecord)
    })

    it("does not resurrect a Closed account when a COMPLETED flow re-fires", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Completed,
      })
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Closed,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).not.toHaveBeenCalled()
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).not.toHaveBeenCalledWith(softCloseSkipRecord)
    })

    it("completes the flow without a status write when the account is already Closed", async () => {
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Closed,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).not.toHaveBeenCalledWith(softCloseSkipRecord)
    })

    it("completes the flow without a status write when the account is Locked", async () => {
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Locked,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(MigrationStateConflictError),
          level: ErrorLevel.Warn,
        }),
      )
      expect(mockRecordException).toHaveBeenCalledWith(softCloseSkipRecord)
    })

    it("completes the flow without a status write when the account is already Migrated", async () => {
      mocks.findAccountById.mockResolvedValue({
        id: accountId,
        status: AccountStatus.Migrated,
      } as Account)

      await completeMigrationFlowForSettledPayment({ paymentHash })

      expect(mocks.updateFlowPhase).toHaveBeenCalledTimes(1)
      expect(mockUpdateAccountStatus).not.toHaveBeenCalled()
      expect(mockRecordException).not.toHaveBeenCalledWith(softCloseSkipRecord)
    })

    it("retries the soft-close when the flow is COMPLETED but the account is still Active", async () => {
      // the guard must not run for a flow that already completed
      mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Failed })
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

    it("records a warn-level exception when the soft-close fails but does not throw", async () => {
      const softCloseError = new Error("status update failed")
      mockUpdateAccountStatus.mockResolvedValue(softCloseError)

      await expect(
        completeMigrationFlowForSettledPayment({ paymentHash }),
      ).resolves.toBeUndefined()

      expect(mockRecordException).toHaveBeenCalledWith(
        expect.objectContaining({ error: softCloseError, level: ErrorLevel.Warn }),
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
      expect(mockReclaimTopUp).not.toHaveBeenCalled()
    })

    it("reclaims a persisted top-up after flipping to FAILED", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        topUpSats: 10 as Satoshis,
      })
      mocks.updateFlowPhase.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Failed,
      })

      await failMigrationFlowForFailedPayment({ paymentHash })

      expect(mockReclaimTopUp).toHaveBeenCalledTimes(1)
      expect(mockReclaimTopUp).toHaveBeenCalledWith({ accountId, topUpSats: 10 })
    })

    it("does not reclaim when the FAILED transition loses the CAS", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        topUpSats: 10 as Satoshis,
      })
      mocks.updateFlowPhase.mockResolvedValue(
        new MigrationStateConflictError("already failed"),
      )

      await failMigrationFlowForFailedPayment({ paymentHash })

      expect(mockReclaimTopUp).not.toHaveBeenCalled()
    })

    it("swallows a reclaim rejection without throwing", async () => {
      mocks.findFlowByLnPaymentHash.mockResolvedValue({
        ...transferringFlow,
        topUpSats: 10 as Satoshis,
      })
      mocks.updateFlowPhase.mockResolvedValue({
        ...transferringFlow,
        phase: MigrationFlowPhase.Failed,
      })
      mockReclaimTopUp.mockRejectedValue(new Error("reclaim blew up"))

      await expect(
        failMigrationFlowForFailedPayment({ paymentHash }),
      ).resolves.toBeUndefined()

      expect(mockRecordException).toHaveBeenCalled()
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
