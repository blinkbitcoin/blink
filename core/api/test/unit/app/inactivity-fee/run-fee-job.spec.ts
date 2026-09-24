jest.mock("@/config", () => ({
  getInactivityFeeConfig: jest.fn(),
  getWindDownConfig: jest.fn(),
  // the price ratios built below read it at call time
  RATIO_PRECISION: 1_000_000,
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: {
    findById: jest.fn(),
    findActiveByAccountId: jest.fn(),
    listActiveIssuedBefore: jest.fn(),
    persistRun: jest.fn(),
    listByAccountId: jest.fn(),
  },
  AccountsRepository: () => ({
    findById: jest.requireMock("@/services/mongoose").__mocks.findById,
  }),
  InactivityFeeNoticesRepository: () => ({
    findActiveByAccountId:
      jest.requireMock("@/services/mongoose").__mocks.findActiveByAccountId,
    listActiveIssuedBefore:
      jest.requireMock("@/services/mongoose").__mocks.listActiveIssuedBefore,
  }),
  InactivityFeeRunsRepository: () => ({
    persistRun: jest.requireMock("@/services/mongoose").__mocks.persistRun,
  }),
  WalletsRepository: () => ({
    listByAccountId: jest.requireMock("@/services/mongoose").__mocks.listByAccountId,
  }),
}))

jest.mock("@/services/ledger", () => ({
  __mocks: {
    getWalletBalanceAmount: jest.fn(),
    getTransactionForWalletByExternalId: jest.fn(),
  },
  LedgerService: () => ({
    getWalletBalanceAmount:
      jest.requireMock("@/services/ledger").__mocks.getWalletBalanceAmount,
    getTransactionForWalletByExternalId:
      jest.requireMock("@/services/ledger").__mocks.getTransactionForWalletByExternalId,
  }),
}))

jest.mock("@/services/ledger/facade", () => ({
  recordInactivityFee: jest.fn(),
}))

jest.mock("@/services/lock", () => ({
  __mocks: { lockInactivityFeeRun: jest.fn(), lockInactivityFeeAccount: jest.fn() },
  LockService: () => ({
    lockInactivityFeeRun:
      jest.requireMock("@/services/lock").__mocks.lockInactivityFeeRun,
    lockInactivityFeeAccount:
      jest.requireMock("@/services/lock").__mocks.lockInactivityFeeAccount,
  }),
}))

jest.mock("@/services/dealer-price", () => ({
  __mocks: { getCentsPerSatsExchangeMidRate: jest.fn() },
  DealerPriceService: () => ({
    getCentsPerSatsExchangeMidRate: jest.requireMock("@/services/dealer-price").__mocks
      .getCentsPerSatsExchangeMidRate,
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  addEventToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  asyncRunInSpan: (_name: string, _options: unknown, fn: () => unknown) => fn(),
}))

jest.mock("@/app/inactivity-fee/refund-fees", () => ({
  refundInactivityFees: jest.fn(),
}))

jest.mock("@/app/prices", () => ({
  getCurrentPriceAsDisplayPriceRatio: jest.fn(),
}))

jest.mock("@/app/wind-down/get-account-wind-down", () => ({
  getAccountWindDown: jest.fn(),
}))

jest.mock("@/app/wind-down/gather-cohort-signals", () => ({
  gatherCohortSignals: jest.fn(),
}))

import { chargeWallet } from "@/app/inactivity-fee/charge-wallet"
import { refundInactivityFees } from "@/app/inactivity-fee/refund-fees"
import { runFeeJob } from "@/app/inactivity-fee/run-fee-job"
import { getCurrentPriceAsDisplayPriceRatio } from "@/app/prices"
import { getAccountWindDown } from "@/app/wind-down/get-account-wind-down"
import { getInactivityFeeConfig, getWindDownConfig } from "@/config"
import { AccountLevel, AccountStatus } from "@/domain/accounts"
import { DealerStalePriceError } from "@/domain/dealer-price"
import { UnknownRepositoryError } from "@/domain/errors"
import { toCents } from "@/domain/fiat"
import {
  InactivityFeeChargeOutcome,
  InactivityFeeDebitInvariantError,
  InactivityFeeInvalidRateError,
  InactivityFeeNoticeNotFoundError,
  InactivityFeeNoticeSource,
  InactivityFeeNoticeStatus,
  InactivityFeeRefundReason,
  InactivityFeeRunAbortedError,
  InactivityFeeRunInProgressError,
  InactivityFeeRunKind,
  InactivityFeeRunMode,
  InactivityFeeSkipReason,
  InactivityFeeTemplateVersion,
} from "@/domain/inactivity-fee"
import { UnknownLedgerError } from "@/domain/ledger"
import { ResourceAttemptsRedlockServiceError } from "@/domain/lock"
import { toDisplayPriceRatio, toWalletPriceRatio } from "@/domain/payments"
import { PriceNotAvailableError } from "@/domain/price"
import { toSeconds } from "@/domain/primitives"
import { ErrorLevel, WalletCurrency } from "@/domain/shared"
import { WindDownStatus } from "@/domain/wind-down"
import { recordInactivityFee } from "@/services/ledger/facade"
import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "@/services/tracing"

const mocks = jest.requireMock("@/services/mongoose").__mocks as Record<string, jest.Mock>
const { getWalletBalanceAmount, getTransactionForWalletByExternalId: findByKey } =
  jest.requireMock("@/services/ledger").__mocks as {
    getWalletBalanceAmount: jest.Mock
    getTransactionForWalletByExternalId: jest.Mock
  }
const { lockInactivityFeeRun, lockInactivityFeeAccount } = jest.requireMock(
  "@/services/lock",
).__mocks as {
  lockInactivityFeeRun: jest.Mock
  lockInactivityFeeAccount: jest.Mock
}
const { getCentsPerSatsExchangeMidRate: midRate } = jest.requireMock(
  "@/services/dealer-price",
).__mocks as { getCentsPerSatsExchangeMidRate: jest.Mock }
const mockRecordFee = recordInactivityFee as jest.MockedFunction<
  typeof recordInactivityFee
>
const mockDisplayRatio = getCurrentPriceAsDisplayPriceRatio as jest.MockedFunction<
  typeof getCurrentPriceAsDisplayPriceRatio
>
const mockGetInactivityFeeConfig = getInactivityFeeConfig as jest.MockedFunction<
  typeof getInactivityFeeConfig
>
const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockGetAccountWindDown = getAccountWindDown as jest.MockedFunction<
  typeof getAccountWindDown
>
const mockRefund = refundInactivityFees as jest.MockedFunction<
  typeof refundInactivityFees
>
const mockAddEvent = addEventToCurrentSpan as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

const iso = (value: string) => new Date(value)
// the 15th; notices issued on the 1st of the month before are 44 days old
const asOf = iso("2026-11-15T02:00:00Z")
const runId = "fee-2026-11-15-test"
const journal = { journalId: "journal" } as LedgerJournal

// $77,566/BTC as the dealer quotes it: cents per sat
const dealerRatio = () => {
  const ratio = toWalletPriceRatio(0.077566)
  if (ratio instanceof Error) throw ratio
  return ratio
}

const config: InactivityFeeConfig = {
  activityRefreshIntervalSec: toSeconds(3600),
  liveCharging: true,
  feeAmountUsdCents: toCents(100),
  effectiveFrom: iso("2026-10-15T00:00:00Z"),
  configVersion: "test",
  skipAccountIds: [],
  notPermittedCountries: [],
  level0Deadline: iso("2026-10-31T22:59:59Z"),
  reactivationLockWaitMs: 1500,
  reactivationBudgetMs: 5000,
}

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
  regions: [
    {
      code: "default",
      timezone: "Europe/Paris",
      receiveDisabledAt: iso("2026-07-31T22:00:00Z"),
      finalDeadline: iso("2026-08-31T21:59:59Z"),
      gateArmsAt: iso("2026-08-31T22:00:00Z"),
      receiveDisabled: false,
      gateClosed: false,
    },
  ],
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
  issuedAt: iso("2026-10-01T02:00:00Z"),
  templateVersion: InactivityFeeTemplateVersion.NoticeV1,
  bulletinIssued: true,
  pushSent: true,
  status: InactivityFeeNoticeStatus.Active,
  source: InactivityFeeNoticeSource.NoticeJob,
  createdAt: iso("2026-10-01T02:00:00Z"),
  updatedAt: iso("2026-10-01T02:00:00Z"),
  ...overrides,
})

const btcWalletId = (accountId: AccountId) => `${accountId}-btc` as WalletId
const usdWalletId = (accountId: AccountId) => `${accountId}-usd` as WalletId
const feeKey = (walletId: WalletId) => `ifee_${walletId}_2026-11`

type Fixture = {
  account: Account
  notice?: InactivityFeeNotice
  btc?: bigint
  usd?: bigint
  keys?: WalletId[]
}

// the worklist yields the notices; everything else is read under the lock from these fixtures
const setup = (fixtures: Fixture[]) => {
  const byId = new Map(fixtures.map((fixture) => [fixture.account.id, fixture]))
  mocks.listActiveIssuedBefore.mockImplementation(async function* () {
    for (const { account: acct, notice: row } of fixtures) {
      yield row ?? notice(acct.id)
    }
  })
  mocks.findById.mockImplementation(async (id: AccountId) => byId.get(id)?.account)
  mocks.findActiveByAccountId.mockImplementation(async (id: AccountId) => {
    const fixture = byId.get(id)
    if (!fixture) return new InactivityFeeNoticeNotFoundError(id)
    return fixture.notice ?? notice(id)
  })
  mocks.listByAccountId.mockImplementation(async (id: AccountId) => {
    const fixture = byId.get(id)
    if (!fixture) return []
    const wallets = []
    if (fixture.btc !== undefined) {
      wallets.push({ id: btcWalletId(id), accountId: id, currency: WalletCurrency.Btc })
    }
    if (fixture.usd !== undefined) {
      wallets.push({ id: usdWalletId(id), accountId: id, currency: WalletCurrency.Usd })
    }
    return wallets
  })
  getWalletBalanceAmount.mockImplementation(async (wallet: Wallet) => {
    const fixture = byId.get(wallet.accountId)
    return {
      amount: wallet.currency === WalletCurrency.Btc ? fixture?.btc : fixture?.usd,
      currency: wallet.currency,
    }
  })
  findByKey.mockImplementation(async ({ walletId }: { walletId: WalletId }) => {
    const owner = [...byId.values()].find((fixture) => fixture.keys?.includes(walletId))
    return owner ? { id: "existing" } : undefined
  })
}

const collect = () => {
  const records: InactivityFeeChargeOutcomeRecord[] = []
  return {
    records,
    onOutcome: (record: InactivityFeeChargeOutcomeRecord) => {
      records.push(record)
    },
  }
}

const expectRun = (result: InactivityFeeRun | ApplicationError): InactivityFeeRun => {
  if (result instanceof Error) throw result
  return result
}

const runLive = (extra: Partial<RunFeeJobArgs> = {}) =>
  runFeeJob({ asOf, dryRun: false, runId, ...extra })

describe("runFeeJob", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetInactivityFeeConfig.mockReturnValue(config)
    mockGetWindDownConfig.mockReturnValue(windDownConfig())
    midRate.mockResolvedValue(dealerRatio())
    mocks.persistRun.mockImplementation(async (run: InactivityFeeRun) => run)
    mockRecordFee.mockResolvedValue(journal)
    lockInactivityFeeRun.mockImplementation(
      async (_key: unknown, fn: () => Promise<unknown>) => fn(),
    )
    lockInactivityFeeAccount.mockImplementation(
      async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) =>
        fn({ aborted: false }),
    )
    setup([])
  })

  it("charges a Bitcoin Balance floor($1 at the pinned rate) sats with the provenance stamped (2)", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 0n }])
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(mockRecordFee).toHaveBeenCalledTimes(1)
    expect(mockRecordFee).toHaveBeenCalledWith({
      walletDescriptor: {
        id: btcWalletId(alice.id),
        currency: WalletCurrency.Btc,
        accountId: alice.id,
      },
      amount: {
        btc: { amount: 1289n, currency: WalletCurrency.Btc },
        usd: { amount: 100n, currency: WalletCurrency.Usd },
      },
      externalId: feeKey(btcWalletId(alice.id)),
      metadata: {
        rate: expect.closeTo(77_566, 6),
        rateSource: "dealer-mid",
        configVersion: "test",
        noticeId: `notice-${alice.id}`,
        runId,
      },
      display: undefined,
    })
    expect(records).toEqual([
      {
        accountId: alice.id,
        walletId: btcWalletId(alice.id),
        currency: WalletCurrency.Btc,
        outcome: InactivityFeeChargeOutcome.Charged,
        amount: 1289,
        externalId: feeKey(btcWalletId(alice.id)),
        noticeId: `notice-${alice.id}`,
      },
      {
        accountId: alice.id,
        walletId: usdWalletId(alice.id),
        currency: WalletCurrency.Usd,
        outcome: InactivityFeeChargeOutcome.Skipped,
        reason: InactivityFeeSkipReason.ZeroBalance,
        externalId: feeKey(usdWalletId(alice.id)),
        noticeId: `notice-${alice.id}`,
      },
    ])
    expect(run).toEqual(
      expect.objectContaining({
        runId,
        kind: InactivityFeeRunKind.Fee,
        mode: InactivityFeeRunMode.Live,
        forcedDry: false,
        configVersion: "test",
        rate: expect.closeTo(77_566, 6),
        rateSource: "dealer-mid",
        debited: { count: 1, sats: 1289, cents: 0 },
        firstExternalIdSeen: feeKey(btcWalletId(alice.id)),
        lastExternalIdSeen: feeKey(btcWalletId(alice.id)),
        counts: {
          scanned: 1,
          accountsWithoutClock: 0,
          byOutcome: { charged: 1, skipped: 1 },
          bySkipReason: { zero_balance: 1 },
        },
      }),
    )
    expect(run.error).toBeUndefined()
    expect(mocks.persistRun).toHaveBeenCalledWith(run)
  })

  it("takes a sub-$1 balance whole, in both currencies (5)", async () => {
    const alice = account()
    setup([{ account: alice, btc: 300n, usd: 60n }])

    const run = expectRun(await runLive())

    expect(mockRecordFee).toHaveBeenCalledTimes(2)
    expect(mockRecordFee.mock.calls.map(([args]) => args.amount)).toEqual([
      {
        btc: { amount: 300n, currency: WalletCurrency.Btc },
        usd: { amount: 23n, currency: WalletCurrency.Usd },
      },
      {
        btc: { amount: 774n, currency: WalletCurrency.Btc },
        usd: { amount: 60n, currency: WalletCurrency.Usd },
      },
    ])
    expect(run.debited).toEqual({ count: 2, sats: 300, cents: 60 })
    expect(run.firstExternalIdSeen).toBe(feeKey(btcWalletId(alice.id)))
    expect(run.lastExternalIdSeen).toBe(feeKey(usdWalletId(alice.id)))
  })

  it("skips notice_too_young inside 31 days, one record and no wallet reads; charges at exactly 31 days (4/4a)", async () => {
    const young = account()
    const exact = account()
    setup([
      {
        account: young,
        notice: notice(young.id, { issuedAt: iso("2026-11-01T02:00:00Z") }),
        btc: 250_000n,
      },
      {
        account: exact,
        notice: notice(exact.id, { issuedAt: iso("2026-10-15T02:00:00Z") }),
        btc: 250_000n,
      },
    ])
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(records).toEqual([
      {
        accountId: young.id,
        outcome: InactivityFeeChargeOutcome.Skipped,
        reason: InactivityFeeSkipReason.NoticeTooYoung,
        noticeId: `notice-${young.id}`,
      },
      expect.objectContaining({
        accountId: exact.id,
        outcome: InactivityFeeChargeOutcome.Charged,
      }),
    ])
    expect(mocks.listByAccountId).toHaveBeenCalledTimes(1)
    expect(mocks.listByAccountId).toHaveBeenCalledWith(exact.id)
    expect(run.counts.bySkipReason).toEqual({ notice_too_young: 1 })
  })

  it("skips no_live_notice when the row is gone or not live under the lock (3a/A9)", async () => {
    const gone = account()
    const dead = account({ lastActivityAt: iso("2025-11-01T00:00:00Z") })
    setup([
      { account: gone, btc: 250_000n },
      {
        account: dead,
        notice: notice(dead.id, { issuedAt: iso("2025-10-01T02:00:00Z") }),
        btc: 250_000n,
      },
    ])
    // the worklist still yields a row for `gone`; the live read finds none
    mocks.findActiveByAccountId.mockImplementation(async (id: AccountId) =>
      id === gone.id
        ? new InactivityFeeNoticeNotFoundError(id)
        : notice(dead.id, { issuedAt: iso("2025-10-01T02:00:00Z") }),
    )
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(mockRecordFee).not.toHaveBeenCalled()
    expect(records.map((record) => [record.accountId, record.reason])).toEqual([
      [gone.id, InactivityFeeSkipReason.NoLiveNotice],
      [dead.id, InactivityFeeSkipReason.NoLiveNotice],
    ])
    expect(run.counts.bySkipReason).toEqual({ no_live_notice: 2 })
  })

  it("re-runs post nothing already posted and finish the remainder (10/A2)", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 500n, keys: [btcWalletId(alice.id)] }])
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    // a voided debit was reversed, so its key must not hold the month: the lookup excludes them
    expect(findByKey).toHaveBeenCalledWith({
      walletId: btcWalletId(alice.id),
      externalId: feeKey(btcWalletId(alice.id)),
      excludeVoided: true,
    })
    expect(mockRecordFee).toHaveBeenCalledTimes(1)
    expect(mockRecordFee.mock.calls[0][0].walletDescriptor.id).toBe(usdWalletId(alice.id))
    expect(records.map((record) => [record.outcome, record.reason])).toEqual([
      [InactivityFeeChargeOutcome.Skipped, InactivityFeeSkipReason.AlreadyDebited],
      [InactivityFeeChargeOutcome.Charged, undefined],
    ])
    expect(run.debited).toEqual({ count: 1, sats: 0, cents: 100 })
  })

  describe("rate", () => {
    it("aborts before any lock or debit when the dealer errors, and says so on the summary", async () => {
      setup([{ account: account(), btc: 250_000n }])
      midRate.mockResolvedValue(new DealerStalePriceError("stale"))

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunAbortedError)
      expect(mocks.listActiveIssuedBefore).not.toHaveBeenCalled()
      expect(lockInactivityFeeAccount).not.toHaveBeenCalled()
      expect(mockRecordFee).not.toHaveBeenCalled()
      expect(mocks.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "DealerStalePriceError: stale",
          debited: { count: 0, sats: 0, cents: 0 },
        }),
      )
      expect(mocks.persistRun.mock.calls[0][0].rate).toBeUndefined()
    })

    it("refuses a rate under which the fee floors to zero sats", async () => {
      setup([{ account: account(), btc: 250_000n }])
      // $150,000,000/BTC: one dollar is 0.67 sats
      const steep = toWalletPriceRatio(150)
      if (steep instanceof Error) throw steep
      midRate.mockResolvedValue(steep)

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunAbortedError)
      expect(mocks.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/^InactivityFeeInvalidRateError: /),
        }),
      )
      expect(new InactivityFeeInvalidRateError("x").name).toBe(
        "InactivityFeeInvalidRateError",
      )
      expect(mockRecordFee).not.toHaveBeenCalled()
    })

    it("pins the rate once per run and never asks again", async () => {
      setup([
        { account: account(), btc: 250_000n },
        { account: account(), btc: 250_000n },
      ])

      expectRun(await runLive())

      expect(midRate).toHaveBeenCalledTimes(1)
      expect(mockRecordFee).toHaveBeenCalledTimes(2)
    })
  })

  describe("dry run", () => {
    it("runs the identical path under the account lock, posts nothing, reports would_charge with amounts (A4)", async () => {
      mockGetInactivityFeeConfig.mockReturnValue({ ...config, liveCharging: false })
      const alice = account()
      setup([{ account: alice, btc: 250_000n, usd: 60n }])
      const { records, onOutcome } = collect()

      const run = expectRun(await runFeeJob({ asOf, dryRun: true, runId, onOutcome }))

      expect(mockRecordFee).not.toHaveBeenCalled()
      expect(lockInactivityFeeRun).not.toHaveBeenCalled()
      expect(lockInactivityFeeAccount).toHaveBeenCalledWith(
        alice.id,
        expect.any(Function),
      )
      expect(findByKey).toHaveBeenCalledTimes(2)
      expect(records).toEqual([
        expect.objectContaining({
          walletId: btcWalletId(alice.id),
          outcome: InactivityFeeChargeOutcome.WouldCharge,
          amount: 1289,
          externalId: feeKey(btcWalletId(alice.id)),
        }),
        expect.objectContaining({
          walletId: usdWalletId(alice.id),
          outcome: InactivityFeeChargeOutcome.WouldCharge,
          amount: 60,
          externalId: feeKey(usdWalletId(alice.id)),
        }),
      ])
      expect(run.mode).toBe(InactivityFeeRunMode.Dry)
      expect(run.rate).toBeCloseTo(77_566, 6)
      expect(run.debited).toEqual({ count: 0, sats: 0, cents: 0 })
      expect(run.firstExternalIdSeen).toBe(feeKey(btcWalletId(alice.id)))
      expect(run.lastExternalIdSeen).toBe(feeKey(usdWalletId(alice.id)))
      expect(run.counts.byOutcome).toEqual({ would_charge: 2 })
      expect(mocks.persistRun).toHaveBeenCalledTimes(1)
    })

    it("records a downgraded on-demand request as forcedDry", async () => {
      setup([{ account: account(), btc: 250_000n }])

      const run = expectRun(
        await runFeeJob({ asOf, dryRun: true, forcedDry: true, runId }),
      )

      expect(run.forcedDry).toBe(true)
      expect(mockRecordFee).not.toHaveBeenCalled()
    })
  })

  it("--live under liveCharging=false is flag_off for every account: the CCO switch wins (12)", async () => {
    mockGetInactivityFeeConfig.mockReturnValue({ ...config, liveCharging: false })
    const alice = account()
    const bob = account()
    setup([
      { account: alice, btc: 250_000n },
      { account: bob, usd: 500n },
    ])
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(mockRecordFee).not.toHaveBeenCalled()
    expect(mocks.listByAccountId).not.toHaveBeenCalled()
    expect(records.map((record) => record.reason)).toEqual(["flag_off", "flag_off"])
    expect(run.mode).toBe(InactivityFeeRunMode.Live)
    expect(run.counts).toEqual({
      scanned: 2,
      accountsWithoutClock: 0,
      byOutcome: { skipped: 2 },
      bySkipReason: { flag_off: 2 },
    })
  })

  it("charges nothing before effectiveFrom, on a dry run as much as a live one", async () => {
    // the advertised date moved past this run: the CCO's package must not promise a charge either
    mockGetInactivityFeeConfig.mockReturnValue({
      ...config,
      effectiveFrom: iso("2026-12-01T00:00:00Z"),
    })
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 500n }])
    const { records, onOutcome } = collect()

    const live = expectRun(await runLive({ onOutcome }))
    const dry = expectRun(await runFeeJob({ asOf, dryRun: true, runId, onOutcome }))

    expect(mockRecordFee).not.toHaveBeenCalled()
    // one record per account, settled before any wallet or ledger read
    expect(mocks.listByAccountId).not.toHaveBeenCalled()
    expect(records.map((record) => record.reason)).toEqual([
      InactivityFeeSkipReason.BeforeEffectiveFrom,
      InactivityFeeSkipReason.BeforeEffectiveFrom,
    ])
    for (const run of [live, dry]) {
      expect(run.counts.byOutcome).toEqual({ skipped: 1 })
      expect(run.counts.bySkipReason).toEqual({ before_effective_from: 1 })
      expect(run.debited).toEqual({ count: 0, sats: 0, cents: 0 })
    }
  })

  it("waits for a reactivation holding the account lock and then sees the superseded notice (A8)", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n }])
    // the handler ran first and superseded the row: the worklist's notice is gone by the time we read
    lockInactivityFeeAccount.mockImplementation(
      async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) => {
        mocks.findActiveByAccountId.mockResolvedValue(
          new InactivityFeeNoticeNotFoundError(alice.id),
        )
        return fn({ aborted: false })
      },
    )
    const { records, onOutcome } = collect()

    expectRun(await runLive({ onOutcome }))

    // default policy: no settings, so the job waits rather than gives up
    expect(lockInactivityFeeAccount).toHaveBeenCalledWith(alice.id, expect.any(Function))
    expect(mockRecordFee).not.toHaveBeenCalled()
    expect(records).toEqual([
      {
        accountId: alice.id,
        outcome: InactivityFeeChargeOutcome.Skipped,
        reason: InactivityFeeSkipReason.NoLiveNotice,
        noticeId: undefined,
      },
    ])
  })

  it("never debits after a Welcome-back: the bumped clock alone already settles it as active", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n }])
    lockInactivityFeeAccount.mockImplementation(
      async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) => {
        mocks.findById.mockResolvedValue({ ...alice, lastActivityAt: asOf })
        return fn({ aborted: false })
      },
    )
    const { records, onOutcome } = collect()

    expectRun(await runLive({ onOutcome }))

    expect(mockRecordFee).not.toHaveBeenCalled()
    expect(records.map((record) => record.reason)).toEqual([
      InactivityFeeSkipReason.Active,
    ])
  })

  it("asks the worklist for notices issued at or before asOf minus 31 days", async () => {
    setup([])

    expectRun(await runLive())

    expect(mocks.listActiveIssuedBefore).toHaveBeenCalledWith({
      cutoff: iso("2026-10-15T02:00:00Z"),
    })
  })

  it("reads the config once per run and threads it through", async () => {
    setup([
      { account: account(), btc: 250_000n },
      { account: account(), btc: 250_000n },
      { account: account(), btc: 250_000n },
    ])

    expectRun(await runLive())

    expect(mockGetInactivityFeeConfig).toHaveBeenCalledTimes(1)
    expect(mockRecordFee).toHaveBeenCalledTimes(3)
  })

  it("a failed post is that wallet's outcome and the run continues", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 500n }])
    const ledgerError = new UnknownLedgerError("commit failed")
    mockRecordFee.mockResolvedValueOnce(ledgerError).mockResolvedValueOnce(journal)
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(records.map((record) => [record.outcome, record.reason])).toEqual([
      [InactivityFeeChargeOutcome.Error, "UnknownLedgerError"],
      [InactivityFeeChargeOutcome.Charged, undefined],
    ])
    // the key and amount the failed post used: it may have committed, and that is what is reconciled
    expect(records[0]).toEqual(
      expect.objectContaining({
        externalId: feeKey(btcWalletId(alice.id)),
        amount: 1289,
      }),
    )
    expect(run.error).toBeUndefined()
    // a Critical per-wallet failure never aborts the run, so it has to show in the summary
    expect(run.counts.byOutcome).toEqual({ error: 1, charged: 1 })
    expect(mocks.persistRun).toHaveBeenCalledWith(
      expect.objectContaining({
        counts: expect.objectContaining({ byOutcome: { error: 1, charged: 1 } }),
      }),
    )
    expect(run.debited).toEqual({ count: 1, sats: 0, cents: 100 })
  })

  it("keeps a wallet's posted record when a later wallet throws", async () => {
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 500n }])
    // the Dollar Balance's post throws rather than returning an error
    mockRecordFee
      .mockResolvedValueOnce(journal)
      .mockRejectedValueOnce(new Error("connection reset"))
    const { records, onOutcome } = collect()

    const run = expectRun(await runLive({ onOutcome }))

    expect(records).toEqual([
      expect.objectContaining({
        walletId: btcWalletId(alice.id),
        outcome: InactivityFeeChargeOutcome.Charged,
        amount: 1289,
        externalId: feeKey(btcWalletId(alice.id)),
      }),
      expect.objectContaining({
        walletId: usdWalletId(alice.id),
        currency: WalletCurrency.Usd,
        outcome: InactivityFeeChargeOutcome.Error,
        reason: "Error",
      }),
    ])
    // the debit that did post stays in the totals and the counts
    expect(run.debited).toEqual({ count: 1, sats: 1289, cents: 0 })
    expect(run.counts.byOutcome).toEqual({ charged: 1, error: 1 })
  })

  describe("a lost account lock", () => {
    it("posts nothing when the signal is already aborted", async () => {
      const alice = account()
      setup([{ account: alice, btc: 250_000n }])
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) =>
          fn({ aborted: true, error: new Error("lock expired") }),
      )
      const { records, onOutcome } = collect()

      expectRun(await runLive({ onOutcome }))

      expect(mockRecordFee).not.toHaveBeenCalled()
      expect(records[0]).toEqual(
        expect.objectContaining({
          outcome: InactivityFeeChargeOutcome.Error,
          reason: "ResourceExpiredLockServiceError",
          externalId: feeKey(btcWalletId(alice.id)),
        }),
      )
    })

    it("posts nothing when the signal is lost during the key lookup", async () => {
      const alice = account()
      setup([{ account: alice, btc: 250_000n }])
      const signal = { aborted: false, error: new Error("lock expired") }
      findByKey.mockImplementation(async () => {
        signal.aborted = true
        return undefined
      })
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (s: unknown) => Promise<unknown>) => fn(signal),
      )
      const { records, onOutcome } = collect()

      expectRun(await runLive({ onOutcome }))

      expect(mockRecordFee).not.toHaveBeenCalled()
      expect(records[0]).toEqual(
        expect.objectContaining({
          outcome: InactivityFeeChargeOutcome.Error,
          reason: "ResourceExpiredLockServiceError",
        }),
      )
    })

    // the lease lapses while the post is in flight; `reactivates` = a reactivation runs in that
    // gap, finds no debit yet and retires the notice before the delayed post commits
    const lapsingDuringPost = ({ reactivates }: { reactivates: boolean }) => {
      const alice = account()
      setup([{ account: alice, btc: 250_000n }])
      const signal = { aborted: false, error: new Error("lock expired") }
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (s: unknown) => Promise<unknown>) => fn(signal),
      )
      let retired = false
      mocks.findActiveByAccountId.mockImplementation(async (id: AccountId) =>
        retired ? new InactivityFeeNoticeNotFoundError(id) : notice(id),
      )
      mockRecordFee.mockImplementation(async () => {
        signal.aborted = true
        retired = reactivates
        return journal
      })
      return alice
    }

    it("refunds in-run a debit that landed after a reactivation retired the notice", async () => {
      const alice = lapsingDuringPost({ reactivates: true })
      mockRefund.mockResolvedValue({
        refundedSats: 1289 as Satoshis,
        refundedCents: 0 as UsdCents,
        failures: [],
      })
      const { records, onOutcome } = collect()

      const run = expectRun(await runLive({ onOutcome }))

      expect(mockRecordFee).toHaveBeenCalledTimes(1)
      expect(mockRefund).toHaveBeenCalledWith({
        accountId: alice.id,
        reason: InactivityFeeRefundReason.Activity,
        runId,
        signal: expect.anything(),
      })
      expect(records.map(({ outcome }) => outcome)).toEqual([
        InactivityFeeChargeOutcome.Charged,
        InactivityFeeChargeOutcome.Refunded,
      ])
      expect(mockAddEvent).toHaveBeenCalledWith(
        "inactivityfee.alert.debit_after_reactivation",
        expect.objectContaining({ "inactivityfee.alert.refundedSats": "1289" }),
      )
      expect(run.counts.byOutcome).toEqual({ charged: 1, refunded: 1 })
    })

    it("leaves a lapsed debit to the next activity write while the notice is still active", async () => {
      lapsingDuringPost({ reactivates: false })
      const { records, onOutcome } = collect()

      expectRun(await runLive({ onOutcome }))

      expect(mockRefund).not.toHaveBeenCalled()
      expect(records.map(({ outcome }) => outcome)).toEqual([
        InactivityFeeChargeOutcome.Charged,
      ])
    })

    it("alerts a failed refund when the lapsed debit cannot be reversed", async () => {
      lapsingDuringPost({ reactivates: true })
      mockRefund.mockResolvedValue(new ResourceAttemptsRedlockServiceError())
      const { records, onOutcome } = collect()

      expectRun(await runLive({ onOutcome }))

      expect(records[1]).toEqual(
        expect.objectContaining({
          outcome: InactivityFeeChargeOutcome.Error,
          reason: "ResourceAttemptsRedlockServiceError",
        }),
      )
      expect(mockAddEvent).toHaveBeenCalledWith(
        "inactivityfee.alert.failed_refund",
        expect.anything(),
      )
      expect(mockRecordException).toHaveBeenCalledWith(
        expect.objectContaining({ level: ErrorLevel.Critical }),
      )
    })

    it("never reconciles a dry run", async () => {
      const alice = account()
      setup([{ account: alice, btc: 250_000n }])
      lockInactivityFeeAccount.mockImplementation(
        async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) =>
          fn({ aborted: true, error: new Error("lock expired") }),
      )

      expectRun(await runFeeJob({ asOf, dryRun: true, runId }))

      expect(mockRefund).not.toHaveBeenCalled()
    })
  })

  it("skips receive_disabled_pre_deadline and jurisdiction per wallet from the loaded context", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [{ ...windDownConfig().regions[0], receiveDisabled: true }],
      }),
    )
    mockGetAccountWindDown.mockResolvedValue({
      status: WindDownStatus.ReceiveDisabled,
      receiveDisabledAt: iso("2026-07-31T22:00:00Z"),
      finalDeadline: iso("2026-08-31T21:59:59Z"),
      gateArmsAt: iso("2026-08-31T22:00:00Z"),
      timezone: "Europe/Paris",
    })
    const alice = account()
    setup([{ account: alice, btc: 250_000n, usd: 500n }])

    const run = expectRun(await runLive())

    expect(mockRecordFee).not.toHaveBeenCalled()
    expect(run.counts.bySkipReason).toEqual({ receive_disabled_pre_deadline: 2 })
  })

  it("an account without wallets holds nothing", async () => {
    setup([{ account: account() }])

    const run = expectRun(await runLive())

    expect(run.counts.bySkipReason).toEqual({ zero_balance: 1 })
  })

  describe("display currency", () => {
    const ngn = () => {
      // 120 kobo per sat
      const ratio = toDisplayPriceRatio<"BTC", DisplayCurrency>({
        ratio: 120,
        displayCurrency: "NGN" as DisplayCurrency,
        walletCurrency: WalletCurrency.Btc,
        fractionDigits: 2,
      })
      if (ratio instanceof Error) throw ratio
      return ratio
    }

    it("stamps the user's leg in the account's display currency, one lookup per currency", async () => {
      const alice = account({ displayCurrency: "NGN" as DisplayCurrency })
      const bob = account({ displayCurrency: "NGN" as DisplayCurrency })
      setup([
        { account: alice, btc: 250_000n, usd: 500n },
        { account: bob, btc: 250_000n },
      ])
      mockDisplayRatio.mockResolvedValue(ngn())

      expectRun(await runLive())

      expect(mockDisplayRatio).toHaveBeenCalledTimes(1)
      expect(mockDisplayRatio).toHaveBeenCalledWith({ currency: "NGN" })
      expect(mockRecordFee).toHaveBeenCalledTimes(3)
      expect(mockRecordFee.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          amount: {
            btc: { amount: 1289n, currency: WalletCurrency.Btc },
            usd: { amount: 100n, currency: WalletCurrency.Usd },
          },
          display: {
            displayAmount: 154_680,
            displayFee: 0,
            displayCurrency: "NGN",
            displayCurrencyFractionDigits: 2,
          },
        }),
      )
    })

    it("falls back to the USD display when the price lookup fails, and still posts", async () => {
      const alice = account({ displayCurrency: "NGN" as DisplayCurrency })
      setup([{ account: alice, btc: 250_000n, usd: 500n }])
      mockDisplayRatio.mockResolvedValue(new PriceNotAvailableError())

      const run = expectRun(await runLive())

      expect(mockDisplayRatio).toHaveBeenCalledTimes(1)
      expect(mockRecordFee).toHaveBeenCalledTimes(2)
      expect(mockRecordFee.mock.calls[0][0].display).toBeUndefined()
      expect(run.debited).toEqual({ count: 2, sats: 1289, cents: 100 })
    })

    it("asks nothing for a USD account", async () => {
      setup([{ account: account(), btc: 250_000n }])

      expectRun(await runLive())

      expect(mockDisplayRatio).not.toHaveBeenCalled()
    })
  })

  describe("locks", () => {
    it("takes the run lock for a live run, keyed on kind and asOf", async () => {
      setup([{ account: account(), btc: 250_000n }])

      expectRun(await runLive())

      expect(lockInactivityFeeRun).toHaveBeenCalledTimes(1)
      expect(lockInactivityFeeRun).toHaveBeenCalledWith(
        { kind: InactivityFeeRunKind.Fee, asOf },
        expect.any(Function),
      )
    })

    it("refuses a second live run for the same day: no scan, no debit, no summary", async () => {
      setup([{ account: account(), btc: 250_000n }])
      lockInactivityFeeRun.mockResolvedValue(new ResourceAttemptsRedlockServiceError())

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunInProgressError)
      expect(midRate).not.toHaveBeenCalled()
      expect(mockRecordFee).not.toHaveBeenCalled()
      expect(mocks.persistRun).not.toHaveBeenCalled()
    })

    it("keeps a finished run's result when the run lock is released late", async () => {
      setup([{ account: account(), btc: 250_000n }])
      lockInactivityFeeRun.mockImplementation(
        async (_key: unknown, fn: () => Promise<unknown>) => {
          await fn()
          return new ResourceAttemptsRedlockServiceError()
        },
      )

      const run = expectRun(await runLive())

      expect(run.debited?.count).toBe(1)
    })

    it("an account lock that cannot be taken is that account's error", async () => {
      const alice = account()
      const bob = account()
      setup([
        { account: alice, btc: 250_000n },
        { account: bob, btc: 250_000n },
      ])
      lockInactivityFeeAccount
        .mockResolvedValueOnce(new ResourceAttemptsRedlockServiceError())
        .mockImplementationOnce(
          async (_id: AccountId, fn: (signal: unknown) => Promise<unknown>) =>
            fn({ aborted: false }),
        )
      const { records, onOutcome } = collect()

      const run = expectRun(await runLive({ onOutcome }))

      expect(records[0]).toEqual({
        accountId: alice.id,
        outcome: InactivityFeeChargeOutcome.Error,
        reason: "ResourceAttemptsRedlockServiceError",
      })
      expect(records[1].outcome).toBe(InactivityFeeChargeOutcome.Charged)
      expect(run.counts.byOutcome).toEqual({ error: 1, charged: 1 })
    })
  })

  describe("abort", () => {
    it("returns a critical InactivityFeeRunAbortedError when the scan itself fails, after persisting the partial summary", async () => {
      const alice = account()
      setup([{ account: alice, btc: 250_000n }])
      mocks.listActiveIssuedBefore.mockImplementation(async function* () {
        yield notice(alice.id)
        throw new Error("cursor died")
      })

      const result = await runLive()

      expect(result).toBeInstanceOf(InactivityFeeRunAbortedError)
      expect(mocks.persistRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runId,
          debited: { count: 1, sats: 1289, cents: 0 },
          error: "Error: cursor died",
        }),
      )
    })

    it("returns the persistence error when only the summary write fails", async () => {
      const failure = new UnknownRepositoryError("runs collection down")
      mocks.persistRun.mockResolvedValue(failure)

      expect(await runLive()).toBe(failure)
    })
  })
})

// The three guards sit between the predicate and the post and are unreachable through the job:
// they exist so that a regression in the predicate pages instead of posting money. Reaching
// them means crafting the state the predicate is supposed to make impossible, so they are
// driven through chargeWallet directly.
describe("chargeWallet pre-post invariant guards", () => {
  const alice = account()
  const wallet = {
    id: btcWalletId(alice.id),
    accountId: alice.id,
    currency: WalletCurrency.Btc,
  } as Wallet

  const chargeArgs = (overrides: Record<string, unknown> = {}) => ({
    account: alice,
    notice: notice(alice.id),
    wallet,
    balance: { amount: 250_000n, currency: WalletCurrency.Btc },
    ctx: { windDownStatus: undefined, assignedCountry: undefined },
    asOf,
    month: "2026-11",
    dryRun: false,
    pinned: { ratio: dealerRatio(), rate: 77_566, rateSource: "dealer-mid" },
    config,
    runId,
    displayRatios: new Map(),
    signal: { aborted: false },
    ...overrides,
  })

  const expectAlerted = (record: InactivityFeeChargeOutcomeRecord, kind: string) => {
    expect(record.reason).toBe("InactivityFeeDebitInvariantError")
    expect(record.externalId).toBe(feeKey(wallet.id))
    expect(mockAddEvent).toHaveBeenCalledWith(
      `inactivityfee.alert.${kind}`,
      expect.objectContaining({
        "inactivityfee.alert.accountId": alice.id,
        "inactivityfee.alert.walletId": wallet.id,
        "inactivityfee.alert.externalId": feeKey(wallet.id),
      }),
    )
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(InactivityFeeDebitInvariantError),
        level: ErrorLevel.Critical,
      }),
    )
    expect(mockRecordFee).not.toHaveBeenCalled()
  }

  beforeEach(() => {
    jest.resetAllMocks()
    findByKey.mockResolvedValue(undefined)
    mockRecordFee.mockResolvedValue(journal)
  })

  it("debit_over_balance: a rate that sizes the fee to nothing never posts a zero debit", async () => {
    // $150,000,000/BTC floors $1 to 0 sats; pinRate refuses such a rate, this asks what if it did not
    const steep = toWalletPriceRatio(150)
    if (steep instanceof Error) throw steep

    const record = await chargeWallet(
      chargeArgs({
        pinned: { ratio: steep, rate: 150_000_000, rateSource: "dealer-mid" },
      }) as Parameters<typeof chargeWallet>[0],
    )

    expect(record.outcome).toBe(InactivityFeeChargeOutcome.Error)
    expectAlerted(record, "debit_over_balance")
  })

  it("debit_without_live_notice: a notice that stops being live after the predicate read it", async () => {
    // the row is superseded from the second read on: the predicate sees a live notice, the guard does not
    let statusReads = 0
    const flipping = new Proxy(notice(alice.id), {
      get: (target, property, receiver) =>
        property === "status" && ++statusReads > 1
          ? InactivityFeeNoticeStatus.Superseded
          : Reflect.get(target, property, receiver),
    })

    const record = await chargeWallet(
      chargeArgs({ notice: flipping }) as Parameters<typeof chargeWallet>[0],
    )

    expect(record.outcome).toBe(InactivityFeeChargeOutcome.Error)
    expectAlerted(record, "debit_without_live_notice")
  })

  it("second_debit_in_month: the month key appears between the predicate and the post", async () => {
    findByKey
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "landed-meanwhile" })

    const record = await chargeWallet(chargeArgs() as Parameters<typeof chargeWallet>[0])

    expectAlerted(record, "second_debit_in_month")
    expect(findByKey).toHaveBeenCalledTimes(2)
  })

  it("posts once when no guard fires", async () => {
    const record = await chargeWallet(chargeArgs() as Parameters<typeof chargeWallet>[0])

    expect(record.outcome).toBe(InactivityFeeChargeOutcome.Charged)
    expect(mockRecordFee).toHaveBeenCalledTimes(1)
    expect(mockAddEvent).not.toHaveBeenCalled()
  })
})
