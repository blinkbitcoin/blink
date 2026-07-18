jest.mock("@/app/migration-flow/settle-migration-flow", () => ({
  completeMigrationFlowForSettledPayment: jest.fn(),
  failMigrationFlowForFailedPayment: jest.fn(),
}))

jest.mock("@/app/payments/update-pending-payments", () => ({
  updatePendingPaymentByHash: jest.fn(),
}))

jest.mock("@/services/ledger", () => ({
  __mockGetTransactionsByHash: jest.fn(),
  LedgerService: () => ({
    getTransactionsByHash:
      jest.requireMock("@/services/ledger").__mockGetTransactionsByHash,
  }),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: {},
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findFlowByAccountId: jest.fn(),
  },
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
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
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { LedgerTransactionType } from "@/domain/ledger"
import { MigrationFlowPhase } from "@/domain/migration-flow"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findFlowByAccountId: jest.Mock
}
const mockUpdatePendingPaymentByHash = updatePendingPaymentByHash as jest.Mock
const mockGetTransactionsByHash = jest.requireMock("@/services/ledger")
  .__mockGetTransactionsByHash as jest.Mock
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

  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdatePendingPaymentByHash.mockResolvedValue(true)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: true })])
    mockCompleteFlow.mockResolvedValue(undefined)
    mockFailFlow.mockResolvedValue(undefined)
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
      .mockResolvedValueOnce(completedFlow)
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])

    const result = await resumeMigrationFlow({ accountId })

    expect(mockCompleteFlow).toHaveBeenCalledTimes(1)
    expect(mockCompleteFlow).toHaveBeenCalledWith({ paymentHash })
    expect(mockFailFlow).not.toHaveBeenCalled()
    expect(result).toBe(completedFlow)
  })

  it("fails a stuck TRANSFERRING flow when the payment is persisted as voided", async () => {
    const failedFlow = {
      ...transferringFlow,
      phase: MigrationFlowPhase.Failed,
    } as MigrationFlow
    mocks.findFlowByAccountId
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

    const result = await resumeMigrationFlow({ accountId })

    expect(mockFailFlow).toHaveBeenCalledTimes(1)
    expect(mockFailFlow).toHaveBeenCalledWith({ paymentHash })
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
