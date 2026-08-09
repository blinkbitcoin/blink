jest.mock("@/services/ledger", () => ({
  __mockGetTransactionsByHash: jest.fn(),
  LedgerService: () => ({
    getTransactionsByHash:
      jest.requireMock("@/services/ledger").__mockGetTransactionsByHash,
  }),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findFlowByAccountId: jest.fn(),
    resetForRetry: jest.fn(),
  },
  MigrationFlowStateRepository: () => ({
    findByAccountId: jest.requireMock("@/services/mongoose").__mocks.findFlowByAccountId,
    resetForRetry: jest.requireMock("@/services/mongoose").__mocks.resetForRetry,
  }),
}))

import { retryMigrationFlow } from "@/app/migration-flow/retry-migration-flow"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import { LedgerTransactionType } from "@/domain/ledger"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"

const mocks = jest.requireMock("@/services/mongoose").__mocks as {
  findFlowByAccountId: jest.Mock
  resetForRetry: jest.Mock
}
const mockGetTransactionsByHash = jest.requireMock("@/services/ledger")
  .__mockGetTransactionsByHash as jest.Mock

describe("retryMigrationFlow", () => {
  const accountId = "account-id" as AccountId
  const paymentHash = "payment-hash" as PaymentHash
  const updatedByPrivilegedClientId = "privileged-client-id" as PrivilegedClientId

  const wedgedSince = new Date(Date.now() - 60 * 60 * 1000)

  const flowIn = (
    phase: MigrationFlowPhase,
    lnPaymentHash?: PaymentHash,
    updatedAt: Date = wedgedSince,
  ) =>
    ({
      accountId,
      phase,
      destinationProofVerified: true,
      lnPaymentHash,
      steps: [],
      updatedAt,
    }) as unknown as MigrationFlow

  const resetFlow = flowIn(MigrationFlowPhase.InProgress)

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

  const failedBundle = [
    paymentTxn({ pending: false, at: new Date("2026-01-01T00:01:00Z") }),
    paymentTxn({
      pending: false,
      debit: 0,
      credit: 1000,
      at: new Date("2026-01-01T00:02:00Z"),
    }),
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mocks.resetForRetry.mockResolvedValue(resetFlow)
    mockGetTransactionsByHash.mockResolvedValue([])
  })

  it("resets a FAILED flow whose hash never reached the ledger", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(mockGetTransactionsByHash).toHaveBeenCalledWith(paymentHash)
    expect(mocks.resetForRetry).toHaveBeenCalledWith({
      accountId,
      fromPhase: MigrationFlowPhase.Failed,
      grantedBy: updatedByPrivilegedClientId,
    })
    expect(result).toBe(resetFlow)
  })

  it("resets a FAILED flow whose ledger verdict is terminally failed", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )
    mockGetTransactionsByHash.mockResolvedValue(failedBundle)

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(mocks.resetForRetry).toHaveBeenCalledTimes(1)
    expect(result).toBe(resetFlow)
  })

  it("resets a FAILED flow that never bound a hash without reading the ledger", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(flowIn(MigrationFlowPhase.Failed))

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
    expect(mocks.resetForRetry).toHaveBeenCalledTimes(1)
    expect(result).toBe(resetFlow)
  })

  it("resets a wedged TRANSFERRING flow with no ledger txns", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Transferring, paymentHash),
    )

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(mocks.resetForRetry).toHaveBeenCalledWith({
      accountId,
      fromPhase: MigrationFlowPhase.Transferring,
      grantedBy: updatedByPrivilegedClientId,
    })
    expect(result).toBe(resetFlow)
  })

  it("refuses a TRANSFERRING flow whose transfer may still be running", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Transferring, paymentHash, new Date()),
    )

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("resets a freshly FAILED flow without waiting out the wedge threshold", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash, new Date()),
    )

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(mocks.resetForRetry).toHaveBeenCalledTimes(1)
    expect(result).toBe(resetFlow)
  })

  it("refuses a TRANSFERRING flow that has any ledger txns", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Transferring, paymentHash),
    )
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: true })])

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("refuses a FAILED flow whose ledger verdict is a success", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: false })])

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("refuses a FAILED flow whose payment is still pending on the ledger", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )
    mockGetTransactionsByHash.mockResolvedValue([paymentTxn({ pending: true })])

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it.each([
    MigrationFlowPhase.NotStarted,
    MigrationFlowPhase.InProgress,
    MigrationFlowPhase.Completed,
  ])("refuses a flow in phase %s", async (phase) => {
    mocks.findFlowByAccountId.mockResolvedValue(flowIn(phase, paymentHash))

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
    expect(mockGetTransactionsByHash).not.toHaveBeenCalled()
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("returns CouldNotFind when there is no migration record", async () => {
    const notFound = new CouldNotFindMigrationFlowStateError(accountId)
    mocks.findFlowByAccountId.mockResolvedValue(notFound)

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBe(notFound)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("propagates the CAS conflict raised by the repository", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(flowIn(MigrationFlowPhase.Failed))
    const conflict = new MigrationStateConflictError("phase moved")
    mocks.resetForRetry.mockResolvedValue(conflict)

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBe(conflict)
  })

  it("refuses when the ledger read fails", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )
    const ledgerError = new Error("ledger unavailable")
    mockGetTransactionsByHash.mockResolvedValue(ledgerError)

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBe(ledgerError)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })

  it("refuses when the determinator cannot classify the bundle", async () => {
    mocks.findFlowByAccountId.mockResolvedValue(
      flowIn(MigrationFlowPhase.Failed, paymentHash),
    )
    mockGetTransactionsByHash.mockResolvedValue([
      paymentTxn({ pending: true, at: new Date("2026-01-01T00:01:00Z") }),
      paymentTxn({ pending: true, at: new Date("2026-01-01T00:02:00Z") }),
    ])

    const result = await retryMigrationFlow({ accountId, updatedByPrivilegedClientId })

    expect(result).toBeInstanceOf(Error)
    expect(mocks.resetForRetry).not.toHaveBeenCalled()
  })
})
