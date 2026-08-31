jest.mock("@/services/mongoose/schema", () => ({
  PostMigrationDepositRelease: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}))

import { CouldNotFindError, UnknownRepositoryError } from "@/domain/errors"
import {
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import { PostMigrationDepositReleaseRepository } from "@/services/mongoose/post-migration-deposit-release"
import { PostMigrationDepositRelease } from "@/services/mongoose/schema"

const mockFindOne = PostMigrationDepositRelease.findOne as jest.Mock
const mockFindOneAndUpdate = PostMigrationDepositRelease.findOneAndUpdate as jest.Mock

describe("PostMigrationDepositReleaseRepository", () => {
  const txHash = "ab".repeat(32) as OnChainTxHash
  const vout = 1 as OnChainTxVout
  const rawRelease = {
    accountId: "account-id",
    walletId: "wallet-id",
    txHash,
    vout,
    address: "bc1qaddress",
    receiptJournalId: "receipt-journal",
    receiptAmountSats: 10_000,
    payoutAmountSats: 10_000,
    lightningAddress: "alice@wallet.example",
    caseReference: "CASE-123",
    status: PostMigrationDepositReleaseStatus.Prepared,
    createdAt: new Date("2026-08-26T00:00:00Z"),
    updatedAt: new Date("2026-08-26T00:00:00Z"),
  }
  const preparedArgs = (): PreparePostMigrationDepositReleaseArgs => ({
    accountId: rawRelease.accountId as AccountId,
    walletId: rawRelease.walletId as WalletId,
    txHash,
    vout,
    address: rawRelease.address as OnChainAddress,
    receiptJournalId: rawRelease.receiptJournalId as LedgerJournalId,
    receiptAmountSats: rawRelease.receiptAmountSats as Satoshis,
    payoutAmountSats: rawRelease.payoutAmountSats as Satoshis,
    lightningAddress: rawRelease.lightningAddress as LightningAddress,
    caseReference: rawRelease.caseReference,
  })
  const repo = PostMigrationDepositReleaseRepository()

  beforeEach(() => jest.clearAllMocks())

  it("returns not found for an unknown output", async () => {
    mockFindOne.mockResolvedValue(null)

    const result = await repo.findByOutput({ txHash, vout })

    expect(result).toBeInstanceOf(CouldNotFindError)
    expect(mockFindOne).toHaveBeenCalledWith({ txHash, vout })
  })

  it("creates a prepared record with an atomic output upsert", async () => {
    mockFindOneAndUpdate.mockResolvedValue(rawRelease)
    const args = preparedArgs()

    const result = await repo.upsertPrepared(args)

    expect(result).toMatchObject({ txHash, vout, status: "PREPARED" })
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { txHash, vout },
      {
        $setOnInsert: {
          ...args,
          status: PostMigrationDepositReleaseStatus.Prepared,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  })

  it("claims a prepared output with compare-and-set", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      ...rawRelease,
      status: PostMigrationDepositReleaseStatus.Processing,
    })

    const result = await repo.claimForRelease({ txHash, vout })

    expect(result).toMatchObject({ status: "PROCESSING" })
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { txHash, vout, status: PostMigrationDepositReleaseStatus.Prepared },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: PostMigrationDepositReleaseStatus.Processing,
        }),
      }),
      { new: true },
    )
  })

  it("refuses a concurrent second claim", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)

    const result = await repo.claimForRelease({ txHash, vout })

    expect(result).toBeInstanceOf(MigrationStateConflictError)
  })

  it("binds an invoice and payment hash only once while processing", async () => {
    const paymentHash = "cd".repeat(32) as PaymentHash
    const paymentRequest = "lnbc1invoice"
    mockFindOneAndUpdate.mockResolvedValue({
      ...rawRelease,
      paymentHash,
      paymentRequest,
    })

    await repo.recordPayment({ txHash, vout, paymentHash, paymentRequest })

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      {
        txHash,
        vout,
        status: PostMigrationDepositReleaseStatus.Processing,
        paymentHash: { $exists: false },
      },
      {
        $set: {
          paymentHash,
          paymentRequest,
          updatedAt: expect.any(Date),
        },
      },
      { new: true },
    )
  })

  it("passes persistence failures through", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("mongo unavailable"))

    const result = await repo.claimForRelease({ txHash, vout })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
  })

  it("maps a found raw record including optional fields", async () => {
    const sweptAt = new Date("2026-08-27T00:00:00Z")
    mockFindOne.mockResolvedValue({
      ...rawRelease,
      paymentHash: "cd".repeat(32),
      paymentRequest: "lnbc1invoice",
      failureReason: "failed",
      sweptAt,
      sweepJournalId: "sweep-journal",
    })

    expect(await repo.findByOutput({ txHash, vout })).toMatchObject({
      paymentHash: "cd".repeat(32),
      paymentRequest: "lnbc1invoice",
      failureReason: "failed",
      sweptAt,
      sweepJournalId: "sweep-journal",
    })
  })

  it("leaves the sweep fields empty when unset", async () => {
    mockFindOne.mockResolvedValue(rawRelease)

    const result = await repo.findByOutput({ txHash, vout })
    if (result instanceof Error) throw result

    expect(result.sweptAt).toBeUndefined()
    expect(result.sweepJournalId).toBeUndefined()
  })

  it("maps find failures to repository errors", async () => {
    mockFindOne.mockRejectedValue(new Error("mongo unavailable"))

    expect(await repo.findByOutput({ txHash, vout })).toBeInstanceOf(
      UnknownRepositoryError,
    )
  })

  it("returns the concurrently inserted record after an upsert duplicate", async () => {
    mockFindOneAndUpdate.mockRejectedValue(
      new Error("E11000 duplicate key error collection releases"),
    )
    mockFindOne.mockResolvedValue(rawRelease)

    expect(await repo.upsertPrepared(preparedArgs())).toMatchObject({ txHash, vout })
    expect(mockFindOne).toHaveBeenCalledWith({ txHash, vout })
  })

  it("maps a nonduplicate upsert failure", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("mongo unavailable"))

    expect(await repo.upsertPrepared(preparedArgs())).toBeInstanceOf(
      UnknownRepositoryError,
    )
  })

  it("refuses to bind a payment when the compare-and-set misses", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)

    expect(
      await repo.recordPayment({
        txHash,
        vout,
        paymentHash: "cd".repeat(32) as PaymentHash,
        paymentRequest: "lnbc1invoice",
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("maps payment binding persistence failures", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("mongo unavailable"))

    expect(
      await repo.recordPayment({
        txHash,
        vout,
        paymentHash: "cd".repeat(32) as PaymentHash,
        paymentRequest: "lnbc1invoice",
      }),
    ).toBeInstanceOf(UnknownRepositoryError)
  })

  it.each([
    [undefined, PostMigrationDepositReleaseStatus.Completed],
    ["ledger failed", PostMigrationDepositReleaseStatus.Failed],
  ] as const)("updates status with failure reason %s", async (failureReason, status) => {
    mockFindOneAndUpdate.mockResolvedValue({
      ...rawRelease,
      status,
      failureReason,
    })

    const result = await repo.updateStatus({
      txHash,
      vout,
      from: PostMigrationDepositReleaseStatus.Processing,
      to: status,
      failureReason,
    })

    expect(result).toMatchObject({ status })
    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { txHash, vout, status: PostMigrationDepositReleaseStatus.Processing },
      {
        $set: {
          status,
          updatedAt: expect.any(Date),
          ...(failureReason ? { failureReason } : {}),
        },
      },
      { new: true },
    )
  })

  it("refuses a status transition when the compare-and-set misses", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)

    expect(
      await repo.updateStatus({
        txHash,
        vout,
        from: PostMigrationDepositReleaseStatus.Processing,
        to: PostMigrationDepositReleaseStatus.Completed,
      }),
    ).toBeInstanceOf(MigrationStateConflictError)
  })

  it("maps status persistence failures", async () => {
    mockFindOneAndUpdate.mockRejectedValue(new Error("mongo unavailable"))

    expect(
      await repo.updateStatus({
        txHash,
        vout,
        from: PostMigrationDepositReleaseStatus.Processing,
        to: PostMigrationDepositReleaseStatus.Completed,
      }),
    ).toBeInstanceOf(UnknownRepositoryError)
  })
})
