jest.mock("@/config", () => ({
  getInactivityFeeConfig: jest.fn(),
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    listDormantAccounts: jest.fn(),
    countWithoutActivityClock: jest.fn(),
    findActiveByAccountId: jest.fn(),
    insertActive: jest.fn(),
    markBulletinIssued: jest.fn(),
    supersede: jest.fn(),
    persistRun: jest.fn(),
    listByAccountId: jest.fn(),
  },
  AccountsRepository: () => ({
    listDormantAccounts:
      jest.requireMock("@/services/mongoose").__mocks.listDormantAccounts,
    countWithoutActivityClock:
      jest.requireMock("@/services/mongoose").__mocks.countWithoutActivityClock,
  }),
  InactivityFeeNoticesRepository: () => ({
    findActiveByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findActiveByAccountId,
    insertActive: jest.requireMock("@/services/mongoose").__mocks.insertActive,
    markBulletinIssued:
      jest.requireMock("@/services/mongoose").__mocks.markBulletinIssued,
    supersede: jest.requireMock("@/services/mongoose").__mocks.supersede,
  }),
  InactivityFeeRunsRepository: () => ({
    persistRun: jest.requireMock("@/services/mongoose").__mocks.persistRun,
  }),
  WalletsRepository: () => ({
    listByAccountId: jest.requireMock("@/services/mongoose").__mocks.listByAccountId,
  }),
}))

jest.mock("@/services/ledger", () => ({
  __mocks: { getWalletBalanceAmount: jest.fn() },
  LedgerService: () => ({
    getWalletBalanceAmount:
      jest.requireMock("@/services/ledger").__mocks.getWalletBalanceAmount,
  }),
}))

jest.mock("@/services/notifications", () => ({
  __mocks: { sendInactivityFeeNotice: jest.fn() },
  NotificationsService: () => ({
    sendInactivityFeeNotice: jest.requireMock("@/services/notifications").__mocks
      .sendInactivityFeeNotice,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  asyncRunInSpan: (_name: string, _options: unknown, fn: () => unknown) => fn(),
}))

jest.mock("@/app/wind-down/get-account-wind-down", () => ({
  getAccountWindDown: jest.fn(),
}))

jest.mock("@/app/wind-down/gather-cohort-signals", () => ({
  gatherCohortSignals: jest.fn(),
}))

import { runNoticeJob } from "@/app/inactivity-fee/run-notice-job"
import { getAccountWindDown } from "@/app/wind-down/get-account-wind-down"
import { gatherCohortSignals } from "@/app/wind-down/gather-cohort-signals"
import { getInactivityFeeConfig, getWindDownConfig } from "@/config"
import { AccountLevel, AccountStatus } from "@/domain/accounts"
import {
  CouldNotListWalletsFromAccountIdError,
  DuplicateKeyForPersistError,
  UnknownRepositoryError,
} from "@/domain/errors"
import { toCents } from "@/domain/fiat"
import {
  InactivityFeeNoticeNotFoundError,
  InactivityFeeNoticeOutcome,
  InactivityFeeNoticeSource,
  InactivityFeeNoticeStatus,
  InactivityFeeRunAbortedError,
  InactivityFeeRunMode,
  InactivityFeeSkipReason,
  InactivityFeeSupersededReason,
  InactivityFeeTemplateVersion,
} from "@/domain/inactivity-fee"
import { NotificationsServiceUnreachableServerError } from "@/domain/notifications"
import { toSeconds } from "@/domain/primitives"
import { WalletCurrency } from "@/domain/shared"
import { WindDownStatus } from "@/domain/wind-down"

const mocks = jest.requireMock("@/services/mongoose").__mocks as Record<string, jest.Mock>
const { getWalletBalanceAmount } = jest.requireMock("@/services/ledger").__mocks as {
  getWalletBalanceAmount: jest.Mock
}
const { sendInactivityFeeNotice } = jest.requireMock("@/services/notifications")
  .__mocks as {
  sendInactivityFeeNotice: jest.Mock
}
const mockGetInactivityFeeConfig = getInactivityFeeConfig as jest.MockedFunction<
  typeof getInactivityFeeConfig
>
const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockGetAccountWindDown = getAccountWindDown as jest.MockedFunction<
  typeof getAccountWindDown
>
const mockGatherCohortSignals = gatherCohortSignals as jest.MockedFunction<
  typeof gatherCohortSignals
>

const iso = (value: string) => new Date(value)
const asOf = iso("2026-10-01T02:00:00Z")
const runId = "notice-2026-10-01-test"

const config: InactivityFeeConfig = {
  activityRefreshIntervalSec: toSeconds(3600),
  liveCharging: false,
  feeAmountUsdCents: toCents(100),
  effectiveFrom: iso("2026-10-15T00:00:00Z"),
  configVersion: "test",
  skipAccountIds: [],
  notPermittedCountries: [],
  level0Deadline: iso("2026-10-31T22:59:59Z"),
}

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: iso("2026-07-31T22:00:00Z"),
  finalDeadline: iso("2026-08-31T21:59:59Z"),
  gateArmsAt: iso("2026-08-31T22:00:00Z"),
  receiveDisabled: false,
  gateClosed: false,
  ...overrides,
})

const windDownConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig => ({
  enabled: true,
  affectedCountries: ["NL"],
  strictCountries: [],
  excludedAccountIds: [],
  receiveBlockedAccountIds: [],
  includeLevelZero: false,
  usePersistedCohortFlag: false,
  ipEvidenceCutoff: iso("2026-07-30T23:59:59Z"),
  convertUsdToBtcAtMidPrice: false,
  regions: [region()],
  ...overrides,
})

let accountCounter = 0
const account = (overrides: Partial<Account> = {}): Account => {
  accountCounter += 1
  return {
    id: `00000000-0000-4000-8000-${String(accountCounter).padStart(12, "0")}` as AccountId,
    createdAt: iso("2020-01-01T00:00:00Z"),
    defaultWalletId: "wallet" as WalletId,
    withdrawFee: undefined,
    level: AccountLevel.One,
    status: AccountStatus.Active,
    statusHistory: [],
    contactEnabled: true,
    kratosUserId: `user-${accountCounter}` as UserId,
    displayCurrency: "USD" as DisplayCurrency,
    lastActivityAt: iso("2025-09-01T00:00:00Z"),
    ...overrides,
  }
}

const notice = (
  accountId: AccountId,
  overrides: Partial<InactivityFeeNotice> = {},
): InactivityFeeNotice => ({
  id: `notice-${accountId}` as InactivityFeeNoticeId,
  accountId,
  issuedAt: iso("2026-09-01T02:00:00Z"),
  templateVersion: InactivityFeeTemplateVersion.NoticeV1,
  bulletinIssued: true,
  pushSent: true,
  status: InactivityFeeNoticeStatus.Active,
  source: InactivityFeeNoticeSource.NoticeJob,
  createdAt: iso("2026-09-01T02:00:00Z"),
  updatedAt: iso("2026-09-01T02:00:00Z"),
  ...overrides,
})

const dormant = (accounts: Account[]) => {
  mocks.listDormantAccounts.mockImplementation(async function* () {
    for (const item of accounts) yield item
  })
}

const walletsFor = (balances: Record<string, bigint>) => {
  mocks.listByAccountId.mockImplementation(async (accountId: AccountId) =>
    Object.keys(balances).map((currency) => ({
      id: `${accountId}-${currency}` as WalletId,
      accountId,
      currency,
      type: "checking",
      onChainAddressIdentifiers: [],
      onChainAddresses: () => [],
    })),
  )
  getWalletBalanceAmount.mockImplementation(
    async (wallet: WalletDescriptor<WalletCurrency>) => ({
      amount: balances[wallet.currency],
      currency: wallet.currency,
    }),
  )
}

describe("runNoticeJob", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetInactivityFeeConfig.mockReturnValue(config)
    mockGetWindDownConfig.mockReturnValue(windDownConfig())
    mocks.countWithoutActivityClock.mockResolvedValue(7)
    mocks.persistRun.mockImplementation(async (run: InactivityFeeRun) => run)
    mocks.findActiveByAccountId.mockImplementation(
      async (accountId: AccountId) => new InactivityFeeNoticeNotFoundError(accountId),
    )
    mocks.insertActive.mockImplementation(async (args: InsertActiveNoticeArgs) =>
      notice(args.accountId, {
        ...args,
        id: `inserted-${args.accountId}` as InactivityFeeNoticeId,
      }),
    )
    mocks.markBulletinIssued.mockImplementation(async ({ id, issuedAt, pushSent }) => ({
      ...notice("marked" as AccountId, { id, issuedAt, pushSent, bulletinIssued: true }),
    }))
    mocks.supersede.mockImplementation(async ({ id, reason, supersededAt }) =>
      notice("superseded" as AccountId, {
        id,
        status: InactivityFeeNoticeStatus.Superseded,
        supersededReason: reason,
        supersededAt,
      }),
    )
    sendInactivityFeeNotice.mockResolvedValue(true)
    walletsFor({ [WalletCurrency.Btc]: 300n, [WalletCurrency.Usd]: 0n })
  })

  const runLive = (extra: Partial<RunNoticeJobArgs> = {}) =>
    runNoticeJob({ asOf, dryRun: false, runId, ...extra })

  const expectRun = (result: InactivityFeeRun | ApplicationError): InactivityFeeRun => {
    if (result instanceof Error) throw result
    return result
  }

  it("notices a newly dormant funded account: insert non-issued, send, then flip", async () => {
    const alice = account()
    dormant([alice])
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.insertActive).toHaveBeenCalledWith({
      accountId: alice.id,
      issuedAt: asOf,
      templateVersion: InactivityFeeTemplateVersion.NoticeV1,
      source: InactivityFeeNoticeSource.NoticeJob,
      bulletinIssued: false,
      pushSent: false,
    })
    expect(sendInactivityFeeNotice).toHaveBeenCalledWith({
      userId: alice.kratosUserId,
      effectiveDate: iso("2026-11-15T00:00:00Z"),
    })
    expect(mocks.markBulletinIssued).toHaveBeenCalledWith({
      id: `inserted-${alice.id}`,
      issuedAt: asOf,
      pushSent: true,
    })
    const insertOrder = mocks.insertActive.mock.invocationCallOrder[0]
    const sendOrder = sendInactivityFeeNotice.mock.invocationCallOrder[0]
    const markOrder = mocks.markBulletinIssued.mock.invocationCallOrder[0]
    expect(insertOrder).toBeLessThan(sendOrder)
    expect(sendOrder).toBeLessThan(markOrder)

    expect(outcomes).toEqual([
      {
        accountId: alice.id,
        outcome: InactivityFeeNoticeOutcome.Noticed,
        noticeId: `inserted-${alice.id}`,
      },
    ])
    expect(run.mode).toBe(InactivityFeeRunMode.Live)
    expect(run.forcedDry).toBe(false)
    expect(run.runId).toBe(runId)
    expect(run.configVersion).toBe("test")
    expect(run.counts).toEqual({
      scanned: 1,
      accountsWithoutClock: 7,
      byOutcome: { noticed: 1 },
      bySkipReason: {},
    })
    expect(mocks.persistRun).toHaveBeenCalledWith(run)
  })

  it("leaves the row non-live when the notifications call fails and carries on", async () => {
    const alice = account()
    const bob = account()
    dormant([alice, bob])
    sendInactivityFeeNotice
      .mockResolvedValueOnce(new NotificationsServiceUnreachableServerError("down"))
      .mockResolvedValueOnce(true)
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.insertActive).toHaveBeenCalledTimes(2)
    expect(mocks.markBulletinIssued).toHaveBeenCalledTimes(1)
    expect(mocks.markBulletinIssued).toHaveBeenCalledWith(
      expect.objectContaining({ id: `inserted-${bob.id}` }),
    )
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.SendFailed,
      reason: "NotificationsServiceUnreachableServerError",
      noticeId: `inserted-${alice.id}`,
    })
    expect(outcomes[1].outcome).toBe(InactivityFeeNoticeOutcome.Noticed)
    expect(run.counts.byOutcome).toEqual({ send_failed: 1, noticed: 1 })
    expect(run.error).toBeUndefined()
  })

  it("reports sent_unflagged when the send succeeded but the flip failed", async () => {
    const alice = account()
    dormant([alice])
    mocks.markBulletinIssued.mockResolvedValue(new UnknownRepositoryError("flip failed"))
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.insertActive).toHaveBeenCalledTimes(1)
    expect(sendInactivityFeeNotice).toHaveBeenCalledTimes(1)
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.SentUnflagged,
      reason: "InactivityFeeNoticeSentButUnflaggedError",
      noticeId: `inserted-${alice.id}`,
    })
    expect(run.counts.byOutcome).toEqual({ sent_unflagged: 1 })
  })

  it("re-sends a non-issued row in place and never inserts a second one", async () => {
    const alice = account()
    dormant([alice])
    const failedLastMonth = notice(alice.id, { bulletinIssued: false, pushSent: false })
    mocks.findActiveByAccountId.mockResolvedValue(failedLastMonth)
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.insertActive).not.toHaveBeenCalled()
    expect(mocks.supersede).not.toHaveBeenCalled()
    expect(sendInactivityFeeNotice).toHaveBeenCalledWith({
      userId: alice.kratosUserId,
      effectiveDate: iso("2026-11-15T00:00:00Z"),
    })
    expect(mocks.markBulletinIssued).toHaveBeenCalledWith({
      id: failedLastMonth.id,
      issuedAt: asOf,
      pushSent: true,
    })
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.Resent,
      noticeId: failedLastMonth.id,
    })
    expect(run.counts.byOutcome).toEqual({ resent: 1 })
  })

  it("reports already_noticed and writes nothing for a live notice", async () => {
    const alice = account()
    dormant([alice])
    mocks.findActiveByAccountId.mockResolvedValue(notice(alice.id))

    const run = expectRun(await runLive())

    expect(mocks.insertActive).not.toHaveBeenCalled()
    expect(mocks.supersede).not.toHaveBeenCalled()
    expect(sendInactivityFeeNotice).not.toHaveBeenCalled()
    expect(mocks.markBulletinIssued).not.toHaveBeenCalled()
    // a live row is settled before any wallet or ledger read
    expect(mocks.listByAccountId).not.toHaveBeenCalled()
    expect(getWalletBalanceAmount).not.toHaveBeenCalled()
    expect(run.counts.byOutcome).toEqual({ already_noticed: 1 })
  })

  it("supersedes a stale active row before inserting and sending a fresh one", async () => {
    // acted after the old notice (2026-09-01), then went dormant again by this asOf
    const alice = account({ lastActivityAt: iso("2025-09-15T00:00:00Z") })
    dormant([alice])
    const stale = notice(alice.id, { issuedAt: iso("2025-09-01T02:00:00Z") })
    mocks.findActiveByAccountId.mockResolvedValue(stale)
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.supersede).toHaveBeenCalledWith({
      id: stale.id,
      reason: InactivityFeeSupersededReason.Stale,
      supersededAt: asOf,
    })
    expect(mocks.insertActive).toHaveBeenCalledTimes(1)
    expect(mocks.supersede.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insertActive.mock.invocationCallOrder[0],
    )
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.Noticed,
      noticeId: `inserted-${alice.id}`,
    })
    expect(run.counts.byOutcome).toEqual({ noticed: 1 })
  })

  it("does not insert when superseding the stale row fails", async () => {
    const alice = account({ lastActivityAt: iso("2025-09-15T00:00:00Z") })
    dormant([alice])
    const stale = notice(alice.id, { issuedAt: iso("2025-09-01T02:00:00Z") })
    mocks.findActiveByAccountId.mockResolvedValue(stale)
    mocks.supersede.mockResolvedValue(new UnknownRepositoryError("mongo down"))
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(mocks.insertActive).not.toHaveBeenCalled()
    expect(sendInactivityFeeNotice).not.toHaveBeenCalled()
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.Error,
      reason: "UnknownRepositoryError",
      noticeId: stale.id,
    })
    expect(run.counts.byOutcome).toEqual({ error: 1 })
  })

  it("treats a duplicate-key race on insert as that account's error, not the run's", async () => {
    const alice = account()
    const bob = account()
    dormant([alice, bob])
    mocks.insertActive
      .mockResolvedValueOnce(new DuplicateKeyForPersistError())
      .mockImplementationOnce(async (args: InsertActiveNoticeArgs) =>
        notice(args.accountId, { ...args, id: "inserted-bob" as InactivityFeeNoticeId }),
      )
    const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

    const run = expectRun(
      await runLive({
        onOutcome: (record) => {
          outcomes.push(record)
        },
      }),
    )

    expect(sendInactivityFeeNotice).toHaveBeenCalledTimes(1)
    expect(outcomes[0]).toEqual({
      accountId: alice.id,
      outcome: InactivityFeeNoticeOutcome.Error,
      reason: "DuplicateKeyForPersistError",
    })
    expect(run.counts.byOutcome).toEqual({ error: 1, noticed: 1 })
  })

  describe("skips", () => {
    it("zero balance: no row, counted by reason", async () => {
      const bob = account()
      dormant([bob])
      walletsFor({ [WalletCurrency.Btc]: 0n, [WalletCurrency.Usd]: 0n })
      const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

      const run = expectRun(
        await runLive({
          onOutcome: (record) => {
            outcomes.push(record)
          },
        }),
      )

      expect(mocks.insertActive).not.toHaveBeenCalled()
      expect(outcomes[0]).toEqual({
        accountId: bob.id,
        outcome: InactivityFeeNoticeOutcome.Skipped,
        reason: InactivityFeeSkipReason.ZeroBalance,
      })
      expect(run.counts).toEqual({
        scanned: 1,
        accountsWithoutClock: 7,
        byOutcome: { skipped: 1 },
        bySkipReason: { zero_balance: 1 },
      })
    })

    it("an account without wallets holds nothing", async () => {
      const bob = account()
      dormant([bob])
      mocks.listByAccountId.mockResolvedValue(
        new CouldNotListWalletsFromAccountIdError(bob.id),
      )

      const run = expectRun(await runLive())

      expect(run.counts.bySkipReason).toEqual({ zero_balance: 1 })
    })

    it("restricted status, skip list and level 0 never load balances or send", async () => {
      const locked = account({ status: AccountStatus.Locked })
      const listed = account()
      const levelZero = account({ level: AccountLevel.Zero })
      dormant([locked, listed, levelZero])
      mockGetInactivityFeeConfig.mockReturnValue({
        ...config,
        skipAccountIds: [listed.id],
      })

      const run = expectRun(await runLive())

      expect(sendInactivityFeeNotice).not.toHaveBeenCalled()
      expect(mocks.findActiveByAccountId).not.toHaveBeenCalled()
      expect(mocks.listByAccountId).not.toHaveBeenCalled()
      expect(getWalletBalanceAmount).not.toHaveBeenCalled()
      expect(run.counts.bySkipReason).toEqual({
        restricted_status: 1,
        skip_list: 1,
        level0_pre_deadline: 1,
      })
    })

    it("asks wind-down only when a region is armed, and skips ReceiveDisabled", async () => {
      const alice = account()
      dormant([alice])
      mockGetAccountWindDown.mockResolvedValue({
        status: WindDownStatus.ReceiveDisabled,
        receiveDisabledAt: iso("2026-07-31T22:00:00Z"),
        finalDeadline: iso("2026-08-31T21:59:59Z"),
        gateArmsAt: iso("2026-08-31T22:00:00Z"),
        timezone: "Europe/Paris",
      })

      let run = expectRun(await runLive())
      expect(mockGetAccountWindDown).not.toHaveBeenCalled()
      expect(run.counts.byOutcome).toEqual({ noticed: 1 })

      jest.clearAllMocks()
      mockGetInactivityFeeConfig.mockReturnValue(config)
      mockGetWindDownConfig.mockReturnValue(
        windDownConfig({ regions: [region({ receiveDisabled: true })] }),
      )
      mocks.countWithoutActivityClock.mockResolvedValue(0)
      mocks.persistRun.mockImplementation(async (r: InactivityFeeRun) => r)
      mocks.findActiveByAccountId.mockImplementation(
        async (id: AccountId) => new InactivityFeeNoticeNotFoundError(id),
      )
      dormant([alice])
      walletsFor({ [WalletCurrency.Btc]: 300n })
      mockGetAccountWindDown.mockResolvedValue({
        status: WindDownStatus.ReceiveDisabled,
        receiveDisabledAt: iso("2026-07-31T22:00:00Z"),
        finalDeadline: iso("2026-08-31T21:59:59Z"),
        gateArmsAt: iso("2026-08-31T22:00:00Z"),
        timezone: "Europe/Paris",
      })

      run = expectRun(await runLive())
      expect(mockGetAccountWindDown).toHaveBeenCalledWith({ account: alice })
      expect(run.counts.bySkipReason).toEqual({ receive_disabled_pre_deadline: 1 })
    })

    it("attributes a jurisdiction only when notPermittedCountries is set", async () => {
      const alice = account()
      dormant([alice])
      mockGatherCohortSignals.mockResolvedValue({
        phoneCountry: "NL",
        deletedPhoneCountries: [],
        creationIpCountry: "NL",
        latestIpCountry: "NL",
      })

      let run = expectRun(await runLive())
      expect(mockGatherCohortSignals).not.toHaveBeenCalled()
      expect(run.counts.byOutcome).toEqual({ noticed: 1 })

      jest.clearAllMocks()
      mockGetInactivityFeeConfig.mockReturnValue({
        ...config,
        notPermittedCountries: ["NL" as RestrictedCountry],
      })
      mockGetWindDownConfig.mockReturnValue(windDownConfig())
      mocks.countWithoutActivityClock.mockResolvedValue(0)
      mocks.persistRun.mockImplementation(async (r: InactivityFeeRun) => r)
      mocks.findActiveByAccountId.mockImplementation(
        async (id: AccountId) => new InactivityFeeNoticeNotFoundError(id),
      )
      dormant([alice])
      walletsFor({ [WalletCurrency.Btc]: 300n })
      mockGatherCohortSignals.mockResolvedValue({
        phoneCountry: "NL",
        deletedPhoneCountries: [],
        creationIpCountry: "NL",
        latestIpCountry: "NL",
      })

      run = expectRun(await runLive())
      expect(mockGatherCohortSignals).toHaveBeenCalledWith({
        accountId: alice.id,
        kratosUserId: alice.kratosUserId,
        ipEvidenceCutoff: iso("2026-07-30T23:59:59Z"),
      })
      expect(run.counts.bySkipReason).toEqual({ jurisdiction: 1 })
    })
  })

  describe("dry run", () => {
    it("evaluates and reports, inserts nothing, sends nothing, still writes the summary", async () => {
      const alice = account()
      const bob = account()
      dormant([alice, bob])
      mocks.findActiveByAccountId
        .mockResolvedValueOnce(new InactivityFeeNoticeNotFoundError(alice.id))
        .mockResolvedValueOnce(notice(bob.id))
      const outcomes: InactivityFeeNoticeOutcomeRecord[] = []

      const run = expectRun(
        await runNoticeJob({
          asOf,
          dryRun: true,
          forcedDry: true,
          runId,
          onOutcome: (record) => {
            outcomes.push(record)
          },
        }),
      )

      expect(mocks.insertActive).not.toHaveBeenCalled()
      expect(mocks.supersede).not.toHaveBeenCalled()
      expect(sendInactivityFeeNotice).not.toHaveBeenCalled()
      expect(mocks.markBulletinIssued).not.toHaveBeenCalled()
      expect(outcomes.map((record) => record.outcome)).toEqual([
        InactivityFeeNoticeOutcome.WouldNotice,
        InactivityFeeNoticeOutcome.AlreadyNoticed,
      ])
      expect(run.mode).toBe(InactivityFeeRunMode.Dry)
      expect(run.forcedDry).toBe(true)
      expect(run.counts.byOutcome).toEqual({ would_notice: 1, already_noticed: 1 })
      expect(mocks.persistRun).toHaveBeenCalledTimes(1)
    })
  })

  describe("abort", () => {
    it("returns a critical InactivityFeeRunAbortedError when the scan itself fails, after persisting the partial summary", async () => {
      const alice = account()
      mocks.listDormantAccounts.mockImplementation(async function* () {
        yield alice
        throw new Error("cursor died")
      })

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunAbortedError)
      expect(mocks.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId,
          counts: expect.objectContaining({ scanned: 1, byOutcome: { noticed: 1 } }),
          error: "Error: cursor died",
        }),
      )
    })

    it("aborts before scanning when the clock count cannot be read", async () => {
      mocks.countWithoutActivityClock.mockResolvedValue(
        new UnknownRepositoryError("down"),
      )

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunAbortedError)
      expect(mocks.listDormantAccounts).not.toHaveBeenCalled()
      expect(mocks.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({ error: "UnknownRepositoryError: down" }),
      )
    })

    it("returns the persistence error when only the summary write fails", async () => {
      dormant([])
      const failure = new UnknownRepositoryError("runs collection down")
      mocks.persistRun.mockResolvedValue(failure)

      expect(await runLive()).toBe(failure)
    })
  })
})
