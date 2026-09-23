jest.mock("@/config", () => ({
  getInactivityFeeConfig: jest.fn(),
}))

jest.mock("@/app/inactivity-fee/refund-fees", () => ({
  refundInactivityFees: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findById: jest.fn(),
    findActiveByAccountId: jest.fn(),
    supersede: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findById,
  }),
  InactivityFeeNoticesRepository: () => ({
    findActiveByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findActiveByAccountId,
    supersede: jest.requireMock("@/services/mongoose").__mocks.supersede,
  }),
}))

jest.mock("@/services/notifications", () => ({
  __mocks: { sendInactivityFeeWelcomeBack: jest.fn() },
  NotificationsService: () => ({
    sendInactivityFeeWelcomeBack: jest.requireMock("@/services/notifications").__mocks
      .sendInactivityFeeWelcomeBack,
  }),
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
  addEventToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  asyncRunInSpan: async (_name: string, _options: unknown, fn: () => unknown) => fn(),
}))

import { reactivateAccount } from "@/app/inactivity-fee/reactivate-account"
import { refundInactivityFees } from "@/app/inactivity-fee/refund-fees"
import { getInactivityFeeConfig } from "@/config"
import { toSats } from "@/domain/bitcoin"
import { UnknownRepositoryError } from "@/domain/errors"
import { toCents } from "@/domain/fiat"
import {
  InactivityFeeNoticeNotFoundError,
  InactivityFeeReactivationTimeoutError,
  InactivityFeeRefundFailedError,
  InactivityFeeSupersededReason,
  reactivationLockSettings,
} from "@/domain/inactivity-fee"
import { UnknownLedgerError } from "@/domain/ledger"
import {
  ResourceAttemptsRedlockServiceError,
  UnknownLockServiceError,
} from "@/domain/lock"
import { NotificationsServiceUnreachableServerError } from "@/domain/notifications"
import { ErrorLevel } from "@/domain/shared"
import { addEventToCurrentSpan } from "@/services/tracing"

const mongooseMocks = jest.requireMock("@/services/mongoose").__mocks as Record<
  string,
  jest.Mock
>
const { sendInactivityFeeWelcomeBack } = jest.requireMock("@/services/notifications")
  .__mocks as { sendInactivityFeeWelcomeBack: jest.Mock }
const { lockInactivityFeeAccount } = jest.requireMock("@/services/lock").__mocks as {
  lockInactivityFeeAccount: jest.Mock
}
const mockRefund = refundInactivityFees as jest.MockedFunction<
  typeof refundInactivityFees
>
const mockConfig = getInactivityFeeConfig as jest.Mock
const mockAddEvent = addEventToCurrentSpan as jest.Mock

const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
const userId = "kratos-user" as UserId
const walletId = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" as WalletId
const previousActivityAt = new Date("2025-08-15T12:00:00Z")
const liveSignal = { aborted: false } as InactivityFeeAccountAbortSignal

const refunded = (
  sats: number,
  cents: number,
  failures: InactivityFeeRefundFailure[] = [],
): InactivityFeeRefundResult => ({
  refundedSats: toSats(sats),
  refundedCents: toCents(cents),
  failures,
})

const activeNotice = (overrides: Partial<InactivityFeeNotice> = {}) =>
  ({
    id: "notice-1" as InactivityFeeNoticeId,
    accountId,
    bulletinIssued: true,
    ...overrides,
  }) as InactivityFeeNotice

const run = () => reactivateAccount({ accountId, previousActivityAt })

beforeEach(() => {
  jest.resetAllMocks()
  mockConfig.mockReturnValue({ reactivationLockWaitMs: 1500, reactivationBudgetMs: 5000 })
  lockInactivityFeeAccount.mockImplementation(
    async (_id: AccountId, fn: (signal: InactivityFeeAccountAbortSignal) => unknown) =>
      fn(liveSignal),
  )
  mockRefund.mockResolvedValue(refunded(0, 0))
  mongooseMocks.findById.mockResolvedValue({ id: accountId, kratosUserId: userId })
  mongooseMocks.findActiveByAccountId.mockResolvedValue(activeNotice())
  mongooseMocks.supersede.mockResolvedValue(activeNotice())
  sendInactivityFeeWelcomeBack.mockResolvedValue(true)
})

describe("reactivationLockSettings", () => {
  it.each([
    [1500, 5],
    [0, 0],
    [299, 0],
    [300, 1],
    [10000, 33],
  ])(
    "turns a %i ms wait into %i retries of 250 ms with 50 ms jitter",
    (waitMs, retryCount) => {
      expect(reactivationLockSettings({ waitMs })).toEqual({
        retryCount,
        retryDelay: 250,
        retryJitter: 50,
      })
    },
  )
})

describe("reactivateAccount", () => {
  it("refunds, sends Welcome-back with the sats, then supersedes the notice — in that order", async () => {
    mockRefund.mockResolvedValue(refunded(1289, 0))

    const result = await run()

    expect(result).toEqual({
      refundedSats: 1289,
      refundedCents: 0,
      noticeSuperseded: true,
    })
    expect(mockRefund).toHaveBeenCalledWith({
      accountId,
      reason: "activity",
      runId: expect.stringMatching(/^reactivation-\d{4}-\d{2}-\d{2}-/),
      signal: liveSignal,
    })
    expect(sendInactivityFeeWelcomeBack).toHaveBeenCalledWith({
      userId,
      refundedSats: 1289,
    })
    expect(mongooseMocks.supersede).toHaveBeenCalledWith({
      id: "notice-1",
      reason: InactivityFeeSupersededReason.Reactivation,
      supersededAt: expect.any(Date),
    })
    const [refundOrder] = mockRefund.mock.invocationCallOrder
    const [welcomeOrder] = sendInactivityFeeWelcomeBack.mock.invocationCallOrder
    const [supersedeOrder] = mongooseMocks.supersede.mock.invocationCallOrder
    expect(refundOrder).toBeLessThan(welcomeOrder)
    expect(welcomeOrder).toBeLessThan(supersedeOrder)
  })

  it("passes both amounts, never blended, when both wallets were charged", async () => {
    mockRefund.mockResolvedValue(refunded(300, 60))

    await run()

    expect(sendInactivityFeeWelcomeBack).toHaveBeenCalledWith({
      userId,
      refundedSats: 300,
      refundedCents: 60,
    })
  })

  it("leaves the zero amount out of a Dollar Balance only refund", async () => {
    mockRefund.mockResolvedValue(refunded(0, 60))

    await run()

    expect(sendInactivityFeeWelcomeBack).toHaveBeenCalledWith({
      userId,
      refundedCents: 60,
    })
  })

  it("noticed, never charged: supersedes, no Welcome-back", async () => {
    const result = await run()

    expect(result).toEqual({ refundedSats: 0, refundedCents: 0, noticeSuperseded: true })
    expect(sendInactivityFeeWelcomeBack).not.toHaveBeenCalled()
    expect(mongooseMocks.findById).not.toHaveBeenCalled()
    expect(mongooseMocks.supersede).toHaveBeenCalledTimes(1)
  })

  it("re-run with nothing left: no Welcome-back, no notice to retire", async () => {
    mongooseMocks.findActiveByAccountId.mockResolvedValue(
      new InactivityFeeNoticeNotFoundError(accountId),
    )

    const result = await run()

    expect(result).toEqual({ refundedSats: 0, refundedCents: 0, noticeSuperseded: false })
    expect(sendInactivityFeeWelcomeBack).not.toHaveBeenCalled()
    expect(mongooseMocks.supersede).not.toHaveBeenCalled()
  })

  it("leaves an active row whose bulletin never went out to the notice job", async () => {
    mongooseMocks.findActiveByAccountId.mockResolvedValue(
      activeNotice({ bulletinIssued: false }),
    )

    const result = await run()

    expect(result).toEqual(expect.objectContaining({ noticeSuperseded: false }))
    expect(mongooseMocks.supersede).not.toHaveBeenCalled()
  })

  it("a failed refund keeps the notice active so the next activity write retries", async () => {
    const ledgerError = new UnknownLedgerError("commit failed")
    mockRefund.mockResolvedValue(refunded(0, 60, [{ walletId, error: ledgerError }]))

    const result = await run()

    expect(result).toBeInstanceOf(InactivityFeeRefundFailedError)
    if (!(result instanceof InactivityFeeRefundFailedError))
      throw new Error("unreachable")
    expect(result.level).toBe(ErrorLevel.Critical)
    expect(result.message).toContain("UnknownLedgerError")
    expect(mongooseMocks.supersede).not.toHaveBeenCalled()
    // the wallet that did come back is still announced
    expect(sendInactivityFeeWelcomeBack).toHaveBeenCalledWith({
      userId,
      refundedCents: 60,
    })
  })

  it("returns the refund function's own error and keeps the notice", async () => {
    const repoError = new UnknownRepositoryError("mongo down")
    mockRefund.mockResolvedValue(repoError)

    expect(await run()).toBe(repoError)
    expect(mongooseMocks.supersede).not.toHaveBeenCalled()
  })

  it("still retires the notice when only the Welcome-back send fails", async () => {
    mockRefund.mockResolvedValue(refunded(1289, 0))
    sendInactivityFeeWelcomeBack.mockResolvedValue(
      new NotificationsServiceUnreachableServerError("down"),
    )

    const result = await run()

    expect(result).toEqual(expect.objectContaining({ noticeSuperseded: true }))
  })

  it("returns a failed supersede so it is retried", async () => {
    const repoError = new UnknownRepositoryError("mongo down")
    mongooseMocks.supersede.mockResolvedValue(repoError)

    expect(await run()).toBe(repoError)
  })

  describe("lock wait and time budget", () => {
    it("hands the lock the settings derived from reactivationLockWaitMs", async () => {
      mockConfig.mockReturnValue({
        reactivationLockWaitMs: 900,
        reactivationBudgetMs: 5000,
      })

      await run()

      expect(lockInactivityFeeAccount).toHaveBeenCalledWith(
        accountId,
        expect.any(Function),
        { retryCount: 3, retryDelay: 250, retryJitter: 50 },
      )
    })

    it("turns a lock held past the wait into a Warn timeout and does nothing else", async () => {
      lockInactivityFeeAccount.mockResolvedValue(
        new ResourceAttemptsRedlockServiceError(),
      )

      const result = await run()

      expect(result).toBeInstanceOf(InactivityFeeReactivationTimeoutError)
      if (!(result instanceof InactivityFeeReactivationTimeoutError)) {
        throw new Error("unreachable")
      }
      expect(result.level).toBe(ErrorLevel.Warn)
      expect(mockRefund).not.toHaveBeenCalled()
      expect(mongooseMocks.supersede).not.toHaveBeenCalled()
    })

    it("returns any other lock error as is", async () => {
      const lockError = new UnknownLockServiceError("redis down")
      lockInactivityFeeAccount.mockResolvedValue(lockError)

      expect(await run()).toBe(lockError)
    })

    it("keeps a finished run's result when the lock is released late", async () => {
      mockRefund.mockResolvedValue(refunded(1289, 0))
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) => {
          await fn(liveSignal)
          return new ResourceAttemptsRedlockServiceError()
        },
      )

      expect(await run()).toEqual(expect.objectContaining({ refundedSats: 1289 }))
    })

    it("stops waiting at the budget, reports a timeout, and lets the work finish", async () => {
      jest.useFakeTimers()
      try {
        mockConfig.mockReturnValue({
          reactivationLockWaitMs: 1500,
          reactivationBudgetMs: 200,
        })
        let release: (value: InactivityFeeRefundResult) => void = () => undefined
        mockRefund.mockReturnValue(
          new Promise<InactivityFeeRefundResult>((resolve) => {
            release = resolve
          }),
        )

        const pending = run()
        await jest.advanceTimersByTimeAsync(250)
        const result = await pending

        expect(result).toBeInstanceOf(InactivityFeeReactivationTimeoutError)
        expect(mongooseMocks.supersede).not.toHaveBeenCalled()

        release(refunded(1289, 0))
        await jest.advanceTimersByTimeAsync(0)
        expect(mongooseMocks.supersede).toHaveBeenCalledTimes(1)
        // a late success is nothing to alert
        expect(mockAddEvent).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    it("alerts a failure that lands after the budget, once, from the work itself", async () => {
      jest.useFakeTimers()
      try {
        mockConfig.mockReturnValue({
          reactivationLockWaitMs: 100,
          reactivationBudgetMs: 200,
        })
        let release: (value: InactivityFeeRefundResult) => void = () => undefined
        mockRefund.mockReturnValue(
          new Promise<InactivityFeeRefundResult>((resolve) => {
            release = resolve
          }),
        )

        const pending = run()
        await jest.advanceTimersByTimeAsync(250)
        expect(await pending).toBeInstanceOf(InactivityFeeReactivationTimeoutError)
        // the timeout itself is the caller's to alert
        expect(mockAddEvent).not.toHaveBeenCalled()

        release(refunded(0, 0, [{ walletId, error: new UnknownLedgerError("late") }]))
        await jest.advanceTimersByTimeAsync(0)

        expect(mockAddEvent).toHaveBeenCalledTimes(1)
        expect(mockAddEvent).toHaveBeenCalledWith(
          "inactivityfee.alert.failed_refund",
          expect.objectContaining({
            "inactivityfee.alert.accountId": accountId,
            "inactivityfee.alert.error": "InactivityFeeRefundFailedError",
          }),
        )
        expect(mongooseMocks.supersede).not.toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    it("leaves a failure inside the budget to the caller: no alert of its own", async () => {
      mockRefund.mockResolvedValue(
        refunded(0, 0, [{ walletId, error: new UnknownLedgerError("in time") }]),
      )

      expect(await run()).toBeInstanceOf(InactivityFeeRefundFailedError)
      expect(mockAddEvent).not.toHaveBeenCalled()
    })

    it("turns a throwing handler into a returned error", async () => {
      mockRefund.mockRejectedValue(new Error("boom"))

      const result = await run()

      expect(result).toBeInstanceOf(Error)
      if (!(result instanceof Error)) throw new Error("unreachable")
      expect(result.message).toBe("boom")
    })
  })
})
