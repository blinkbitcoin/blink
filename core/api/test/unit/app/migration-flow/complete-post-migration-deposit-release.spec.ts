jest.mock("@/app/prices", () => ({
  getCurrentPriceAsWalletPriceRatio: jest.fn(),
}))
jest.mock("@/services/ledger", () => ({
  __getByJournal: jest.fn(),
  __getByExternalId: jest.fn(),
  LedgerService: () => ({
    getTransactionForWalletByJournalId:
      jest.requireMock("@/services/ledger").__getByJournal,
    getTransactionForWalletByExternalId:
      jest.requireMock("@/services/ledger").__getByExternalId,
  }),
}))
jest.mock("@/services/ledger/facade", () => ({ recordIntraledger: jest.fn() }))
jest.mock("@/services/lock", () => ({
  __signal: { aborted: false },
  LockService: () => ({
    lockOnChainTxHashAndVout: jest.fn((_output, fn) =>
      fn(jest.requireMock("@/services/lock").__signal),
    ),
  }),
}))
jest.mock("@/services/mongoose", () => ({
  __repo: {
    findByOutput: jest.fn(),
    recordSweep: jest.fn(),
    updateStatus: jest.fn(),
  },
  PostMigrationDepositReleaseRepository: () =>
    jest.requireMock("@/services/mongoose").__repo,
}))

import { completePostMigrationDepositRelease } from "@/app/migration-flow/complete-post-migration-deposit-release"
import { getCurrentPriceAsWalletPriceRatio } from "@/app/prices"
import { UnknownRepositoryError } from "@/domain/errors"
import { LedgerTransactionType, UnknownLedgerError } from "@/domain/ledger"
import {
  MigrationStateConflictError,
  PostMigrationDepositReleaseStatus,
} from "@/domain/migration-flow"
import { WalletCurrency } from "@/domain/shared"
import * as LedgerFacade from "@/services/ledger/facade"

const ledgerMocks = jest.requireMock("@/services/ledger") as {
  __getByJournal: jest.Mock
  __getByExternalId: jest.Mock
}
const repo = jest.requireMock("@/services/mongoose").__repo as {
  findByOutput: jest.Mock
  recordSweep: jest.Mock
  updateStatus: jest.Mock
}
const mockRecordIntraledger = LedgerFacade.recordIntraledger as jest.Mock
const mockPriceRatio = getCurrentPriceAsWalletPriceRatio as jest.Mock
const lockSignal = jest.requireMock("@/services/lock").__signal as {
  aborted: boolean
  error?: Error
}

describe("completePostMigrationDepositRelease", () => {
  const walletId = "11111111-1111-4111-8111-111111111111" as WalletId
  const bankOwnerWalletId = "22222222-2222-4222-8222-222222222222" as WalletId
  const txHash = "ab".repeat(32) as OnChainTxHash
  const vout = 0 as OnChainTxVout
  const receiptJournalId = "receipt-journal" as LedgerJournalId
  const sweepJournalId = "sweep-journal" as LedgerJournalId
  const sweepExternalId = `pmdr_${txHash}_0` as LedgerExternalId

  let release: PostMigrationDepositRelease

  beforeEach(() => {
    jest.clearAllMocks()
    lockSignal.aborted = false
    lockSignal.error = undefined
    release = {
      accountId: "33333333-3333-4333-8333-333333333333" as AccountId,
      walletId,
      txHash,
      vout,
      address: "bcrt1qrelease" as OnChainAddress,
      receiptJournalId,
      receiptAmountSats: 1_000 as Satoshis,
      payoutAmountSats: 1_000 as Satoshis,
      lightningAddress: "alice@wallet.example" as LightningAddress,
      caseReference: "CASE-123",
      status: PostMigrationDepositReleaseStatus.Processing,
      paymentHash: "cd".repeat(32) as PaymentHash,
      paymentRequest: "lnbc1bound",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    repo.findByOutput.mockImplementation(() => Promise.resolve(release))
    repo.recordSweep.mockImplementation(({ sweepJournalId: journalId }) => {
      release = { ...release, sweepJournalId: journalId, sweptAt: new Date() }
      return Promise.resolve(release)
    })
    repo.updateStatus.mockImplementation(({ to }) => {
      release = { ...release, status: to }
      return Promise.resolve(release)
    })
    ledgerMocks.__getByExternalId.mockResolvedValue(undefined)
    ledgerMocks.__getByJournal.mockImplementation(({ walletId: id, journalId }) => {
      if (journalId === receiptJournalId) return Promise.resolve(receiptTx())
      return Promise.resolve(sweepTx(id))
    })
    mockRecordIntraledger.mockResolvedValue({ journalId: sweepJournalId })
    mockPriceRatio.mockResolvedValue({
      convertFromBtc: ({ amount }: BtcPaymentAmount) => ({
        amount: amount / 2n,
        currency: WalletCurrency.Usd,
      }),
    })
  })

  it("persists the exact sweep before marking the release completed", async () => {
    const result = await complete()

    expect(result).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
      sweepJournalId,
    })
    expect(mockRecordIntraledger).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: sweepExternalId,
        amount: {
          btc: { amount: 1_000n, currency: WalletCurrency.Btc },
          usd: { amount: 500n, currency: WalletCurrency.Usd },
        },
        metadata: expect.objectContaining({
          satsAmount: 1_000,
          centsAmount: 500,
        }),
      }),
    )
    expect(repo.recordSweep.mock.invocationCallOrder[0]).toBeLessThan(
      repo.updateStatus.mock.invocationCallOrder[0],
    )
  })

  it("recovers after the ledger commit when sweep persistence initially fails", async () => {
    const persistenceError = new UnknownRepositoryError("mongo unavailable")
    repo.recordSweep
      .mockResolvedValueOnce(persistenceError)
      .mockImplementationOnce(({ sweepJournalId: journalId }) => {
        release = { ...release, sweepJournalId: journalId, sweptAt: new Date() }
        return Promise.resolve(release)
      })
    ledgerMocks.__getByExternalId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(sweepTx(walletId))

    expect(await complete()).toBe(persistenceError)
    expect(await complete()).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
      sweepJournalId,
    })
    expect(mockRecordIntraledger).toHaveBeenCalledTimes(1)
    expect(repo.recordSweep).toHaveBeenCalledTimes(2)
  })

  it("validates a persisted sweep before completing without reposting it", async () => {
    release = {
      ...release,
      sweepJournalId,
      sweptAt: new Date(),
    }

    expect(await complete()).toMatchObject({
      status: PostMigrationDepositReleaseStatus.Completed,
      sweepJournalId,
    })
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
    expect(repo.recordSweep).not.toHaveBeenCalled()
  })

  it("does not sweep or complete when the bound receipt no longer matches", async () => {
    ledgerMocks.__getByJournal.mockResolvedValue({
      ...receiptTx(),
      credit: 999,
    })

    expect(await complete()).toBeInstanceOf(MigrationStateConflictError)
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it("leaves the release retryable when the ledger lookup fails", async () => {
    const ledgerError = new UnknownLedgerError("database unavailable")
    ledgerMocks.__getByExternalId.mockResolvedValue(ledgerError)

    expect(await complete()).toBe(ledgerError)
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it("leaves the release retryable when the price lookup fails", async () => {
    const priceError = new UnknownLedgerError("price unavailable")
    mockPriceRatio.mockResolvedValue(priceError)

    expect(await complete()).toBe(priceError)
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
    expect(repo.recordSweep).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it("does not complete when the ledger sweep commit fails", async () => {
    const ledgerError = new UnknownLedgerError("commit failed")
    mockRecordIntraledger.mockResolvedValue(ledgerError)

    expect(await complete()).toBe(ledgerError)
    expect(repo.recordSweep).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  it("rejects completion without a bound payout hash", async () => {
    release = { ...release, paymentHash: undefined }

    expect(await complete()).toBeInstanceOf(MigrationStateConflictError)
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
  })

  it("rejects a failed release", async () => {
    release = { ...release, status: PostMigrationDepositReleaseStatus.Failed }

    expect(await complete()).toBeInstanceOf(MigrationStateConflictError)
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
  })

  it("does not commit after the output lock expires", async () => {
    lockSignal.aborted = true
    lockSignal.error = new Error("lock expired")

    expect(await complete()).toMatchObject({ message: "lock expired" })
    expect(mockRecordIntraledger).not.toHaveBeenCalled()
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })

  const complete = () =>
    completePostMigrationDepositRelease({ txHash, vout, bankOwnerWalletId })

  const receiptTx = () => ({
    type: LedgerTransactionType.OnchainReceipt,
    pendingConfirmation: false,
    walletId,
    currency: WalletCurrency.Btc,
    txHash,
    vout,
    address: release.address,
    debit: 0,
    credit: release.receiptAmountSats,
    journalId: receiptJournalId,
  })

  const sweepTx = (id: WalletId) => ({
    type: LedgerTransactionType.IntraLedger,
    walletId: id,
    currency: WalletCurrency.Btc,
    externalId: sweepExternalId,
    debit: id === walletId ? release.receiptAmountSats : 0,
    credit: id === bankOwnerWalletId ? release.receiptAmountSats : 0,
    journalId: sweepJournalId,
  })
})
