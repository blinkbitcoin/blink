jest.mock("@/app/migration-flow/settle-migration-flow", () => ({
  completeMigrationFlowForSettledPayment: jest.fn(),
  failMigrationFlowForFailedPayment: jest.fn(),
}))

jest.mock("@/app/payments/update-pending-payments", () => ({
  updatePendingPaymentByHash: jest.fn(),
}))

jest.mock("@/services/ledger/facade", () => ({
  getTransactionsForWalletsByPaymentHash: jest.fn(),
}))

jest.mock("@/services/lnd", () => ({
  __mockLookupPayment: jest.fn(),
  LndService: () => ({
    lookupPayment: jest.requireMock("@/services/lnd").__mockLookupPayment,
  }),
}))

jest.mock("@/services/lock", () => ({
  __mockLockWalletId: jest.fn(),
  LockService: () => ({
    lockWalletId: jest.requireMock("@/services/lock").__mockLockWalletId,
  }),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: {},
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findFlowByAccountId: jest.fn(),
    findAccountWalletsByAccountId: jest.fn(),
  },
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
  }),
  WalletsRepository: () => ({
    findAccountWalletsByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findAccountWalletsByAccountId,
  }),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { resumeMigrationFlow } from "@/app/migration-flow/resume-migration-flow"
import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "@/app/migration-flow/settle-migration-flow"
import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"
import { PaymentStatus } from "@/domain/bitcoin/lightning"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { LedgerTransactionType } from "@/domain/ledger"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { getTransactionsForWalletsByPaymentHash } from "@/services/ledger/facade"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findFlowByAccountId: jest.Mock
  findAccountWalletsByAccountId: jest.Mock
}
const mockLookupPayment = jest.requireMock("@/services/lnd")
  .__mockLookupPayment as jest.Mock
const mockLockWalletId = jest.requireMock("@/services/lock")
  .__mockLockWalletId as jest.Mock
const mockUpdatePendingPaymentByHash = updatePendingPaymentByHash as jest.Mock
const mockGetTransactionsByHash = getTransactionsForWalletsByPaymentHash as jest.Mock
const mockCompleteFlow = completeMigrationFlowForSettledPayment as jest.Mock
const mockFailFlow = failMigrationFlowForFailedPayment as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

describe("resumeMigrationFlow", () => {
  const accountId = "account-id" as AccountId
  const paymentHash = "payment-hash" as PaymentHash
  const transferringFlow = {
    accountId,
    phase: MigrationFlowPhase.Transferring,
    destinationProofVerified: true,
    lnPaymentHash: paymentHash,
    steps: [],
  } as unknown as MigrationFlow

  const paymentTxn = ({
    pending,
    debit = 1000,
    credit = 0,
    at = new Date("2026-01-01T00:00:00Z"),
  }: {
    pending: boolean
    debit?: number
    credit?: number
    at?: Date
  }) =>
    ({
      type: LedgerTransactionType.Payment,
      pendingConfirmation: pending,
      debit,
      credit,
      timestamp: at,
    }) as LedgerTransaction<WalletCurrency>

  const btcWalletId = "btc-wallet-id" as WalletId
  let lockHeld = false
  let hooksCalledUnderLock = 0

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdatePendingPaymentByHash.mockResolvedValue(true)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: true })])
    mockCompleteFlow.mockResolvedValue(undefined)
    mockFailFlow.mockResolvedValue(undefined)
    mocks.findAccountWalletsByAccountId.mockResolvedValue({
      BTC: { id: btcWalletId },
      USD: { id: "usd-wallet-id" as WalletId },
    })
    lockHeld = false
    hooksCalledUnderLock = 0
    mockLockWalletId.mockImplementation(
      async (_walletId: WalletId, fn: (signal: unknown) => Promise<unknown>) => {
        lockHeld = true
        try {
          return await fn({ aborted: false })
        } finally {
          lockHeld = false
        }
      },
    )
    mockCompleteFlow.mockImplementation(async () => {
      if (lockHeld) hooksCalledUnderLock += 1
    })
    mockFailFlow.mockImplementation(async () => {
      if (lockHeld) hooksCalledUnderLock += 1
    })
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Pending })
  })

  it("returns CouldNotFind when there is no migration record", async () => {
    const notFound = new CouldNotFindMigrationFlowStateError(accountId)
    mocks.findFlowByAccountId.mockResolvedValue(notFound)

    const result = await resumeMigrationFlow({ accountId })

    expect(result).toBe(notFound)
    expect(mockUpdatePendingPaymentByHash).not.toHaveBeenCalled()
  })

  it("returns an IN_PROGRESS flow as-is without reconciling", async () => {
    const inProgressFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.InProgress,
      lnPaymentHash: undefined,
    } as MigrationFlow
    mocks.findFlowByAccountId.mockResolvedValue(inProgressFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(result).toBe(inProgressFlow)
    expect(mockUpdatePendingPaymentByHash).not.toHaveBeenCalled()
  })

  it("returns a terminal flow as-is without reconciling", async () => {
    const completedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Completed,
    } as MigrationFlow
    mocks.findFlowByAccountId.mockResolvedValue(completedFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(result).toBe(completedFlow)
    expect(mockUpdatePendingPaymentByHash).not.toHaveBeenCalled()
  })

  it("reconciles a TRANSFERRING flow by hash exactly once and never re-sends", async () => {
    const completedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Completed,
    } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(completedFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockUpdatePendingPaymentByHash).toHaveBeenCalledTimes(1)
    expect(mockUpdatePendingPaymentByHash).toHaveBeenCalledWith(
      expect.objectContaining({ paymentHash }),
    )
    expect(result).toBe(completedFlow)
    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
  })

  it("reflects a failed reconciliation in the returned phase", async () => {
    const failedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Failed,
    } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(failedFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockUpdatePendingPaymentByHash).toHaveBeenCalledTimes(1)
    expect(result).toBe(failedFlow)
  })

  it("returns the still-pending flow while the payment remains in-flight", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockUpdatePendingPaymentByHash).toHaveBeenCalledTimes(1)
    expect(result).toBe(transferringFlow)
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mockFailFlow).not.toHaveBeenCalled()
  })

  it("completes a stuck TRANSFERRING flow when the payment is persisted as settled", async () => {
    const completedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Completed,
    } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(completedFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })

    const result = await resumeMigrationFlow({ accountId })

    expect(mockLockWalletId).toHaveBeenCalledTimes(1)
    expect(mockLockWalletId.mock.calls[0][0]).toBe(btcWalletId)
    expect(mockGetTransactionsByHash).toHaveBeenCalledWith({
      walletIds: [btcWalletId, "usd-wallet-id"],
      paymentHash,
    })
    expect(mockCompleteFlow).toHaveBeenCalledTimes(1)
    expect(mockCompleteFlow).toHaveBeenCalledWith({ paymentHash })
    expect(hooksCalledUnderLock).toBe(0)
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(completedFlow)
  })

  it("does not fail a flow when lnd reports the payment settled despite a reverted ledger", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([
      paymentTxn({ pending: false, at: new Date("2026-01-01T00:01:00Z") }),
      paymentTxn({
        pending: false,
        debit: 0,
        credit: 1000,
        at: new Date("2026-01-01T00:02:00Z"),
      }),
    ])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })

    const result = await resumeMigrationFlow({ accountId })

    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
  })

  it("does not act when the lnd lookup errors", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    const lookupError = new Error("payment not found")
    mockLookupPayment.mockResolvedValue(lookupError)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: lookupError }),
    )
  })

  it("never consults lnd while the ledger still shows the payment pending", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: true })])

    await resumeMigrationFlow({ accountId })

    expect(mockLookupPayment).not.toHaveBeenCalled()
  })

  it("does not act when the lock was lost while resolving the verdict", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })
    mockLockWalletId.mockImplementation(
      (_walletId: WalletId, fn: (signal: unknown) => Promise<unknown>) =>
        fn({ aborted: true, error: new Error("lock expired") }),
    )

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(ResourceExpiredLockServiceError) }),
    )
  })

  it("does not complete when lnd disagrees with a settled-looking ledger snapshot", async () => {
    // the trigger's revert clears the pending flag before it writes the reversal;
    // a read in that window is one settled debit, but lnd already reports failed
    const finalFlow = { ...transferringFlow } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(finalFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Failed })

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(finalFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(MigrationStateConflictError) }),
    )
  })

  it("does not act when the flow left TRANSFERRING before the lock was taken", async () => {
    const failedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Failed,
    } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(failedFlow)
      .mockResolvedValueOnce(failedFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })

    const result = await resumeMigrationFlow({ accountId })

    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(result).toBe(failedFlow)
  })

  it("returns the re-read flow without a verdict when the wallet lock cannot be taken", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Settled })
    const lockError = new ResourceExpiredLockServiceError()
    mockLockWalletId.mockResolvedValue(lockError)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: lockError }),
    )
  })

  it("fails a stuck TRANSFERRING flow when the payment is persisted as voided", async () => {
    const failedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Failed,
    } as MigrationFlow
    mocks.findFlowByAccountId
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(transferringFlow)
      .mockResolvedValueOnce(failedFlow)
    mockGetTransactionsByHash.mockResolvedValue([
      paymentTxn({ pending: false, at: new Date("2026-01-01T00:01:00Z") }),
      paymentTxn({
        pending: false,
        debit: 0,
        credit: 1000,
        at: new Date("2026-01-01T00:02:00Z"),
      }),
    ])
    mockLookupPayment.mockResolvedValue({ status: PaymentStatus.Failed })

    const result = await resumeMigrationFlow({ accountId })

    expect(mockFailFlow).toHaveBeenCalledTimes(1)
    expect(mockFailFlow).toHaveBeenCalledWith({ paymentHash })
    expect(hooksCalledUnderLock).toBe(0)
    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(result).toBe(failedFlow)
  })

  it("leaves the flow TRANSFERRING when no payment record is persisted", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    mockGetTransactionsByHash.mockResolvedValue([])

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
  })

  it("leaves the flow TRANSFERRING when the ledger lookup errors", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)
    const ledgerError = new Error("ledger unavailable")
    mockGetTransactionsByHash.mockResolvedValue(ledgerError)

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).not.toHaveBeenCalled()
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(transferringFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: ledgerError }),
    )
  })

  it("swallows reconciliation errors and still returns the re-read flow", async () => {
    const reconcileError = new Error("lnd unavailable")
    mockUpdatePendingPaymentByHash.mockResolvedValue(reconcileError)
    mocks.findFlowByAccountId.mockResolvedValue(transferringFlow)

    const result = await resumeMigrationFlow({ accountId })

    expect(result).toBe(transferringFlow)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ error: reconcileError }),
    )
  })
})
