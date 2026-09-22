jest.mock("@/services/mongoose", () => ({
  __mocks: { listByAccountId: jest.fn() },
  WalletsRepository: () => ({
    listByAccountId: jest.requireMock("@/services/mongoose").__mocks.listByAccountId,
  }),
}))

jest.mock("@/services/ledger", () => ({
  __mocks: {
    listInactivityFeeTransactionsByWalletId: jest.fn(),
    getTransactionForWalletByExternalId: jest.fn(),
  },
  LedgerService: () => ({
    listInactivityFeeTransactionsByWalletId:
      jest.requireMock("@/services/ledger").__mocks
        .listInactivityFeeTransactionsByWalletId,
    getTransactionForWalletByExternalId:
      jest.requireMock("@/services/ledger").__mocks.getTransactionForWalletByExternalId,
  }),
}))

jest.mock("@/services/ledger/facade", () => ({
  recordInactivityFeeRefund: jest.fn(),
}))

jest.mock("@/services/lock", () => ({
  __mocks: { lockInactivityFeeAccount: jest.fn() },
  LockService: () => ({
    lockInactivityFeeAccount:
      jest.requireMock("@/services/lock").__mocks.lockInactivityFeeAccount,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
}))

import { refundInactivityFees } from "@/app/inactivity-fee/refund-fees"
import { CouldNotListWalletsFromAccountIdError } from "@/domain/errors"
import {
  InactivityFeeRefundFailedError,
  InactivityFeeRefundReason,
} from "@/domain/inactivity-fee"
import { LedgerTransactionType, UnknownLedgerError } from "@/domain/ledger"
import {
  ResourceAttemptsRedlockServiceError,
  ResourceExpiredLockServiceError,
} from "@/domain/lock"
import { WalletCurrency } from "@/domain/shared"
import { recordInactivityFeeRefund } from "@/services/ledger/facade"

const { listByAccountId } = jest.requireMock("@/services/mongoose").__mocks as {
  listByAccountId: jest.Mock
}
const {
  listInactivityFeeTransactionsByWalletId: listFeeRows,
  getTransactionForWalletByExternalId: findByKey,
} = jest.requireMock("@/services/ledger").__mocks as {
  listInactivityFeeTransactionsByWalletId: jest.Mock
  getTransactionForWalletByExternalId: jest.Mock
}
const { lockInactivityFeeAccount } = jest.requireMock("@/services/lock").__mocks as {
  lockInactivityFeeAccount: jest.Mock
}
const mockRecordRefund = recordInactivityFeeRefund as jest.MockedFunction<
  typeof recordInactivityFeeRefund
>

const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
const btcWalletId = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" as WalletId
const usdWalletId = "11111111-2222-4333-8444-555555555555" as WalletId
const runId = "reactivation-2026-10-20-test"
const journal = { journalId: "journal" } as LedgerJournal

const wallet = (id: WalletId, currency: WalletCurrency) =>
  ({ id, currency, accountId }) as Wallet
const btcWallet = wallet(btcWalletId, WalletCurrency.Btc)
const usdWallet = wallet(usdWalletId, WalletCurrency.Usd)

let nextId = 0
const row = ({
  type,
  walletId,
  month,
  sats,
  cents,
  noticeId,
}: {
  type: LedgerTransactionType
  walletId: WalletId
  month: string
  sats: number
  cents: number
  noticeId?: string
}): LedgerTransaction<WalletCurrency> => {
  nextId += 1
  const isFee = type === LedgerTransactionType.InactivityFee
  const isBtc = walletId === btcWalletId
  const prefix = isFee ? "ifee" : "ifee_refund"
  return {
    id: `tx-${nextId}` as LedgerTransactionId,
    walletId,
    type,
    debit: (isFee ? (isBtc ? sats : cents) : 0) as Satoshis,
    credit: (isFee ? 0 : isBtc ? sats : cents) as Satoshis,
    currency: walletId === btcWalletId ? WalletCurrency.Btc : WalletCurrency.Usd,
    timestamp: new Date("2026-10-15T00:00:00Z"),
    pendingConfirmation: false,
    journalId: `journal-${nextId}` as LedgerJournalId,
    externalId: `${prefix}_${walletId}_${month}` as LedgerExternalId,
    feeKnownInAdvance: false,
    satsAmount: sats as Satoshis,
    centsAmount: cents as UsdCents,
    noticeId,
    fee: undefined,
    usd: undefined,
    feeUsd: undefined,
  }
}
const fee = (args: Omit<Parameters<typeof row>[0], "type">) =>
  row({ type: LedgerTransactionType.InactivityFee, ...args })
const refund = (args: Omit<Parameters<typeof row>[0], "type">) =>
  row({ type: LedgerTransactionType.InactivityFeeRefund, ...args })

const rowsByWallet = (
  rows: Record<string, LedgerTransaction<WalletCurrency>[] | Error>,
) => listFeeRows.mockImplementation(async (walletId: WalletId) => rows[walletId] ?? [])

const liveSignal = { aborted: false } as InactivityFeeAccountAbortSignal

const run = (extra: Partial<RefundInactivityFeesArgs> = {}) =>
  refundInactivityFees({
    accountId,
    reason: InactivityFeeRefundReason.Activity,
    runId,
    ...extra,
  })

const expectResult = (
  result: InactivityFeeRefundResult | ApplicationError,
): InactivityFeeRefundResult => {
  if (result instanceof Error) throw result
  return result
}

beforeEach(() => {
  jest.resetAllMocks()
  listByAccountId.mockResolvedValue([btcWallet, usdWallet])
  listFeeRows.mockResolvedValue([])
  findByKey.mockResolvedValue(undefined)
  mockRecordRefund.mockResolvedValue(journal)
  lockInactivityFeeAccount.mockImplementation(
    async (_id: AccountId, fn: (signal: InactivityFeeAccountAbortSignal) => unknown) =>
      fn(liveSignal),
  )
})

describe("refundInactivityFees", () => {
  it("refunds a Bitcoin Balance debit with the debit's own sats, cents, month, wallet and notice", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({
          walletId: btcWalletId,
          month: "2026-10",
          sats: 1289,
          cents: 100,
          noticeId: "n1",
        }),
      ],
    })

    const result = expectResult(await run())

    expect(result).toEqual({ refundedSats: 1289, refundedCents: 0, failures: [] })
    expect(mockRecordRefund).toHaveBeenCalledTimes(1)
    expect(mockRecordRefund).toHaveBeenCalledWith({
      walletDescriptor: { id: btcWalletId, currency: WalletCurrency.Btc, accountId },
      amount: {
        btc: { amount: 1289n, currency: WalletCurrency.Btc },
        usd: { amount: 100n, currency: WalletCurrency.Usd },
      },
      externalId: `ifee_refund_${btcWalletId}_2026-10`,
      metadata: { refundReason: "activity", noticeId: "n1", runId },
    })
  })

  it("copies the debit row's display fields onto the refund so both rows agree", async () => {
    rowsByWallet({
      [btcWalletId]: [
        {
          ...fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
          displayAmount: 154_680 as DisplayCurrencyBaseAmount,
          displayFee: 0 as DisplayCurrencyBaseAmount,
          displayCurrency: "NGN" as DisplayCurrency,
          displayCurrencyFractionDigits: 2,
        },
      ],
    })

    expectResult(await run())

    expect(mockRecordRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        display: {
          displayAmount: 154_680,
          displayFee: 0,
          displayCurrency: "NGN",
          displayCurrencyFractionDigits: 2,
        },
      }),
    )
  })

  it("posts nothing when there are no debits (noticed, never charged)", async () => {
    const result = expectResult(await run())

    expect(result).toEqual({ refundedSats: 0, refundedCents: 0, failures: [] })
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("refunds every unrefunded month, each under its own key and amount", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({
          walletId: btcWalletId,
          month: "2026-08",
          sats: 1300,
          cents: 100,
          noticeId: "n1",
        }),
        fee({
          walletId: btcWalletId,
          month: "2026-09",
          sats: 1250,
          cents: 100,
          noticeId: "n2",
        }),
      ],
    })

    const result = expectResult(await run())

    expect(result.refundedSats).toBe(2550)
    expect(
      mockRecordRefund.mock.calls.map(([args]) => [
        args.externalId,
        args.amount.btc.amount,
        args.metadata.noticeId,
      ]),
    ).toEqual([
      [`ifee_refund_${btcWalletId}_2026-08`, 1300n, "n1"],
      [`ifee_refund_${btcWalletId}_2026-09`, 1250n, "n2"],
    ])
  })

  it("refunds both wallets, sats and cents kept apart", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 300, cents: 23 }),
      ],
      [usdWalletId]: [
        fee({ walletId: usdWalletId, month: "2026-10", sats: 773, cents: 60 }),
      ],
    })

    const result = expectResult(await run())

    expect(result).toEqual({ refundedSats: 300, refundedCents: 60, failures: [] })
    expect(mockRecordRefund).toHaveBeenCalledTimes(2)
    expect(mockRecordRefund.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        walletDescriptor: { id: usdWalletId, currency: WalletCurrency.Usd, accountId },
        amount: {
          btc: { amount: 773n, currency: WalletCurrency.Btc },
          usd: { amount: 60n, currency: WalletCurrency.Usd },
        },
        externalId: `ifee_refund_${usdWalletId}_2026-10`,
      }),
    )
  })

  it("posts nothing on a re-run: every debit already has its pair", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
        refund({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      ],
    })

    const result = expectResult(await run())

    expect(result).toEqual({ refundedSats: 0, refundedCents: 0, failures: [] })
    expect(findByKey).not.toHaveBeenCalled()
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("re-checks the refund key under the lock and skips a pair that landed meanwhile", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      ],
    })
    findByKey.mockResolvedValue(
      refund({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
    )

    const result = expectResult(await run())

    expect(findByKey).toHaveBeenCalledWith({
      walletId: btcWalletId,
      externalId: `ifee_refund_${btcWalletId}_2026-10`,
    })
    expect(result).toEqual({ refundedSats: 0, refundedCents: 0, failures: [] })
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("carries on past a failed post and reports it", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 300, cents: 23 }),
      ],
      [usdWalletId]: [
        fee({ walletId: usdWalletId, month: "2026-10", sats: 773, cents: 60 }),
      ],
    })
    const ledgerError = new UnknownLedgerError("commit failed")
    mockRecordRefund.mockResolvedValueOnce(ledgerError).mockResolvedValueOnce(journal)

    const result = expectResult(await run())

    expect(result).toEqual({
      refundedSats: 0,
      refundedCents: 60,
      failures: [
        {
          walletId: btcWalletId,
          externalId: `ifee_refund_${btcWalletId}_2026-10`,
          error: ledgerError,
        },
      ],
    })
  })

  it("carries on past a wallet whose fee rows cannot be read", async () => {
    const ledgerError = new UnknownLedgerError("mongo down")
    rowsByWallet({
      [btcWalletId]: ledgerError,
      [usdWalletId]: [
        fee({ walletId: usdWalletId, month: "2026-10", sats: 773, cents: 60 }),
      ],
    })

    const result = expectResult(await run())

    expect(result.refundedCents).toBe(60)
    expect(result.failures).toEqual([{ walletId: btcWalletId, error: ledgerError }])
  })

  it("reports a failed key re-check and posts nothing for that debit", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      ],
    })
    const ledgerError = new UnknownLedgerError("mongo down")
    findByKey.mockResolvedValue(ledgerError)

    const result = expectResult(await run())

    expect(result.failures.map(({ error }) => error)).toEqual([ledgerError])
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("reports a fee row with an unreadable key and never refunds it blindly", async () => {
    const broken = {
      ...fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      externalId: "ifee_broken" as LedgerExternalId,
    }
    rowsByWallet({ [btcWalletId]: [broken] })

    const result = expectResult(await run())

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toBeInstanceOf(InactivityFeeRefundFailedError)
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("reports a refund row that is not the debit's mirror and posts nothing", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
        refund({ walletId: btcWalletId, month: "2026-10", sats: 500, cents: 100 }),
      ],
    })

    const result = expectResult(await run())

    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].error).toBeInstanceOf(InactivityFeeRefundFailedError)
    expect(result.refundedSats).toBe(0)
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("stops posting once the lock is lost", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      ],
    })
    const lost = { aborted: true, error: new Error("expired") }
    lockInactivityFeeAccount.mockImplementation(
      async (_id: AccountId, fn: (signal: unknown) => unknown) => fn(lost),
    )

    const result = expectResult(await run())

    expect(result.failures[0].error).toBeInstanceOf(ResourceExpiredLockServiceError)
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("does not post when the lock is lost during the pair lookup", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
      ],
    })
    const signal = { aborted: false, error: undefined as Error | undefined }
    lockInactivityFeeAccount.mockImplementation(
      async (_id: AccountId, fn: (signal: unknown) => unknown) => fn(signal),
    )
    findByKey.mockImplementation(async () => {
      signal.aborted = true
      signal.error = new Error("expired")
      return undefined
    })

    const result = expectResult(await run())

    expect(findByKey).toHaveBeenCalledTimes(1)
    expect(result.failures[0].error).toBeInstanceOf(ResourceExpiredLockServiceError)
    expect(mockRecordRefund).not.toHaveBeenCalled()
  })

  it("stamps the claims reason when the release path calls it", async () => {
    rowsByWallet({
      [btcWalletId]: [
        fee({ walletId: btcWalletId, month: "2026-08", sats: 1300, cents: 100 }),
      ],
      [usdWalletId]: [
        fee({ walletId: usdWalletId, month: "2026-09", sats: 773, cents: 60 }),
      ],
    })

    const result = expectResult(
      await run({
        reason: InactivityFeeRefundReason.Claims,
        runId: "claims-2026-11-02-x",
      }),
    )

    expect(result).toEqual({ refundedSats: 1300, refundedCents: 60, failures: [] })
    for (const [args] of mockRecordRefund.mock.calls) {
      expect(args.metadata).toEqual(
        expect.objectContaining({ refundReason: "claims", runId: "claims-2026-11-02-x" }),
      )
    }
  })

  describe("locking", () => {
    it("takes the account lock with the default policy when no signal is handed in", async () => {
      await run()

      expect(lockInactivityFeeAccount).toHaveBeenCalledTimes(1)
      expect(lockInactivityFeeAccount).toHaveBeenCalledWith(
        accountId,
        expect.any(Function),
      )
    })

    it("does not lock again when the caller already holds the lock", async () => {
      rowsByWallet({
        [btcWalletId]: [
          fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
        ],
      })

      const result = expectResult(await run({ signal: liveSignal }))

      expect(lockInactivityFeeAccount).not.toHaveBeenCalled()
      expect(result.refundedSats).toBe(1289)
    })

    it("returns the lock error and touches nothing when the lock is not acquired", async () => {
      const lockError = new ResourceAttemptsRedlockServiceError()
      lockInactivityFeeAccount.mockResolvedValue(lockError)

      expect(await run()).toBe(lockError)
      expect(listByAccountId).not.toHaveBeenCalled()
      expect(mockRecordRefund).not.toHaveBeenCalled()
    })

    it("keeps the posted result when the lock is released late", async () => {
      rowsByWallet({
        [btcWalletId]: [
          fee({ walletId: btcWalletId, month: "2026-10", sats: 1289, cents: 100 }),
        ],
      })
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) => {
          await fn(liveSignal)
          return new ResourceAttemptsRedlockServiceError()
        },
      )

      expect(expectResult(await run()).refundedSats).toBe(1289)
    })
  })

  it("returns the repository error when the wallets cannot be listed", async () => {
    const repoError = new CouldNotListWalletsFromAccountIdError(accountId)
    listByAccountId.mockResolvedValue(repoError)

    expect(await run()).toBe(repoError)
  })
})
