import { AccountLevel, AccountStatus } from "@/domain/accounts"
import {
  evaluateAccountEligibility,
  evaluateCharge,
  evaluateChargeAccountChecks,
  InactivityFeeNoticeSource,
  InactivityFeeNoticeStatus,
  InactivityFeeSkipReason,
  InactivityFeeTemplateVersion,
  sizeInactivityFee,
} from "@/domain/inactivity-fee"
import { toCents } from "@/domain/fiat"
import { WalletPriceRatio } from "@/domain/payments"
import { toSeconds } from "@/domain/primitives"
import { WalletCurrency } from "@/domain/shared"
import { WindDownStatus } from "@/domain/wind-down"

const iso = (value: string) => new Date(value)

const asOf = iso("2026-10-01T02:00:00Z")
const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId

const config: InactivityFeeConfig = {
  activityRefreshIntervalSec: toSeconds(3600),
  liveCharging: false,
  feeAmountUsdCents: toCents(100),
  effectiveFrom: iso("2026-10-15T00:00:00Z"),
  configVersion: "test",
  skipAccountIds: [],
  notPermittedCountries: [],
  level0Deadline: iso("2026-10-31T22:59:59Z"),
  reactivationLockWaitMs: 1500,
  reactivationBudgetMs: 5000,
}

const account = (overrides: Partial<Account> = {}): Account => ({
  id: accountId,
  createdAt: iso("2020-01-01T00:00:00Z"),
  defaultWalletId: "wallet" as WalletId,
  withdrawFee: undefined,
  level: AccountLevel.One,
  status: AccountStatus.Active,
  statusHistory: [],
  contactEnabled: true,
  kratosUserId: "user" as UserId,
  displayCurrency: "USD" as DisplayCurrency,
  lastActivityAt: iso("2025-09-01T00:00:00Z"),
  ...overrides,
})

const ctx = (
  overrides: Partial<InactivityFeeEligibilityContext> = {},
): InactivityFeeEligibilityContext => ({
  activeNotice: undefined,
  balances: [{ amount: 300n, currency: WalletCurrency.Btc }],
  windDownStatus: undefined,
  assignedCountry: undefined,
  ...overrides,
})

describe("evaluateAccountEligibility", () => {
  it("is eligible for a dormant, funded, active account", () => {
    expect(
      evaluateAccountEligibility({ account: account(), asOf, ctx: ctx(), config }),
    ).toEqual({ outcome: "eligible" })
  })

  it("accepts invited accounts too", () => {
    expect(
      evaluateAccountEligibility({
        account: account({ status: AccountStatus.Invited }),
        asOf,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it.each([
    AccountStatus.New,
    AccountStatus.Pending,
    AccountStatus.Locked,
    AccountStatus.Closed,
    AccountStatus.Migrated,
  ])("skips restricted_status for %s", (status) => {
    expect(
      evaluateAccountEligibility({
        account: account({ status }),
        asOf,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.RestrictedStatus })
  })

  it("skips skip_list when the account is listed", () => {
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx(),
        config: { ...config, skipAccountIds: [accountId] },
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.SkipList })
  })

  it("skips active when the last activity is inside 12 calendar months", () => {
    expect(
      evaluateAccountEligibility({
        account: account({ lastActivityAt: iso("2025-10-01T02:00:01Z") }),
        asOf,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.Active })
  })

  it("is dormant at exactly 12 calendar months", () => {
    expect(
      evaluateAccountEligibility({
        account: account({ lastActivityAt: iso("2025-10-01T02:00:00Z") }),
        asOf,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it("skips active when the clock was never backfilled", () => {
    expect(
      evaluateAccountEligibility({
        account: account({ lastActivityAt: undefined }),
        asOf,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.Active })
  })

  it("skips zero_balance when every balance is zero or there is no wallet", () => {
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({
          balances: [
            { amount: 0n, currency: WalletCurrency.Btc },
            { amount: 0n, currency: WalletCurrency.Usd },
          ],
        }),
        config,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.ZeroBalance })
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ balances: [] }),
        config,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.ZeroBalance })
  })

  it("a positive USD balance alone is enough", () => {
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({
          balances: [
            { amount: 0n, currency: WalletCurrency.Btc },
            { amount: 1n, currency: WalletCurrency.Usd },
          ],
        }),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it("skips receive_disabled_pre_deadline only while the region is receive-disabled", () => {
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ windDownStatus: WindDownStatus.ReceiveDisabled }),
        config,
      }),
    ).toEqual({
      outcome: "skip",
      reason: InactivityFeeSkipReason.ReceiveDisabledPreDeadline,
    })
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ windDownStatus: WindDownStatus.GatedClosed }),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ windDownStatus: WindDownStatus.PreCutoff }),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it("skips level0_pre_deadline before the deadline and not on or after it", () => {
    const levelZero = account({ level: AccountLevel.Zero })
    expect(
      evaluateAccountEligibility({ account: levelZero, asOf, ctx: ctx(), config }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.Level0PreDeadline })
    expect(
      evaluateAccountEligibility({
        account: levelZero,
        asOf: config.level0Deadline,
        ctx: ctx(),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it("skips jurisdiction when the attributed country is not permitted", () => {
    const configured = { ...config, notPermittedCountries: ["NL" as RestrictedCountry] }
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ assignedCountry: "NL" }),
        config: configured,
      }),
    ).toEqual({ outcome: "skip", reason: InactivityFeeSkipReason.Jurisdiction })
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ assignedCountry: "DE" }),
        config: configured,
      }),
    ).toEqual({ outcome: "eligible" })
    // no evidence never matches
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({ assignedCountry: undefined }),
        config: configured,
      }),
    ).toEqual({ outcome: "eligible" })
  })

  it("does not read the notice row: liveness is the job's concern, not eligibility", () => {
    expect(
      evaluateAccountEligibility({
        account: account(),
        asOf,
        ctx: ctx({
          activeNotice: {
            id: "notice" as InactivityFeeNoticeId,
            accountId,
            issuedAt: asOf,
            templateVersion: "notice-v1",
            bulletinIssued: true,
            pushSent: true,
            status: "active",
            source: "notice-job",
            createdAt: asOf,
            updatedAt: asOf,
          },
        }),
        config,
      }),
    ).toEqual({ outcome: "eligible" })
  })
})

// the fee run: the 15th, a notice issued on the 1st of the month before (44 days)
const feeAsOf = iso("2026-11-15T02:00:00Z")
const liveConfig: InactivityFeeConfig = { ...config, liveCharging: true }

const notice = (overrides: Partial<InactivityFeeNotice> = {}): InactivityFeeNotice => ({
  id: "notice" as InactivityFeeNoticeId,
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

const sats = (amount: bigint): BalanceAmount<WalletCurrency> => ({
  amount,
  currency: WalletCurrency.Btc,
})
const cents = (amount: bigint): BalanceAmount<WalletCurrency> => ({
  amount,
  currency: WalletCurrency.Usd,
})

const charge = (overrides: Partial<EvaluateChargeArgs> = {}) =>
  evaluateCharge({
    account: account(),
    notice: notice(),
    balance: sats(250_000n),
    keyExists: false,
    asOf: feeAsOf,
    dryRun: false,
    ctx: { windDownStatus: undefined, assignedCountry: undefined },
    config: liveConfig,
    ...overrides,
  })

const skip = (reason: InactivityFeeSkipReason) => ({ outcome: "skip", reason })

describe("evaluateCharge", () => {
  it("charges a dormant, funded account with a live notice older than 31 days and no key", () => {
    expect(charge()).toEqual({ outcome: "charge" })
  })

  it("flag_off comes first on a live run: nothing else is looked at", () => {
    expect(
      charge({
        config,
        account: account({ status: AccountStatus.Locked }),
        notice: undefined,
      }),
    ).toEqual(skip(InactivityFeeSkipReason.FlagOff))
  })

  it("a dry run ignores the flag and reports what it holds back", () => {
    expect(charge({ config, dryRun: true })).toEqual({ outcome: "charge" })
    expect(charge({ config, dryRun: true, balance: sats(0n) })).toEqual(
      skip(InactivityFeeSkipReason.ZeroBalance),
    )
  })

  describe("before_effective_from", () => {
    // the date the notice copy and the app advertise; moving it forward holds the fee on its own
    const notYet = { ...liveConfig, effectiveFrom: new Date(feeAsOf.getTime() + 1) }

    it("skips a live run before the date", () => {
      expect(charge({ config: notYet })).toEqual(
        skip(InactivityFeeSkipReason.BeforeEffectiveFrom),
      )
    })

    it("skips a dry run before the date too: nothing would be charged either", () => {
      // unlike flag_off, which a dry run looks past to report what the flag holds back
      expect(
        charge({ config: { ...notYet, liveCharging: false }, dryRun: true }),
      ).toEqual(skip(InactivityFeeSkipReason.BeforeEffectiveFrom))
    })

    it("charges when asOf is exactly effectiveFrom: the fee applies from that instant", () => {
      expect(charge({ config: { ...liveConfig, effectiveFrom: feeAsOf } })).toEqual({
        outcome: "charge",
      })
    })

    it("charges after the date", () => {
      expect(
        charge({
          config: { ...liveConfig, effectiveFrom: new Date(feeAsOf.getTime() - 1) },
        }),
      ).toEqual({ outcome: "charge" })
    })

    it("comes after flag_off and before every account check", () => {
      // the CCO switch still wins on a live run
      expect(charge({ config: { ...notYet, liveCharging: false } })).toEqual(
        skip(InactivityFeeSkipReason.FlagOff),
      )
      // and the date settles the account before its status, notice or balance are looked at
      expect(
        charge({
          config: notYet,
          account: account({ status: AccountStatus.Locked }),
          notice: undefined,
          balance: sats(0n),
        }),
      ).toEqual(skip(InactivityFeeSkipReason.BeforeEffectiveFrom))
    })
  })

  it("runs the static account checks after the flag", () => {
    expect(charge({ account: account({ status: AccountStatus.Locked }) })).toEqual(
      skip(InactivityFeeSkipReason.RestrictedStatus),
    )
    expect(charge({ config: { ...liveConfig, skipAccountIds: [accountId] } })).toEqual(
      skip(InactivityFeeSkipReason.SkipList),
    )
    expect(
      charge({ account: account({ lastActivityAt: iso("2026-01-01T00:00:00Z") }) }),
    ).toEqual(skip(InactivityFeeSkipReason.Active))
    expect(
      charge({
        account: account({ level: AccountLevel.Zero }),
        asOf: iso("2026-10-15T02:00:00Z"),
        notice: notice({ issuedAt: iso("2026-09-01T02:00:00Z") }),
      }),
    ).toEqual(skip(InactivityFeeSkipReason.Level0PreDeadline))
  })

  it("skips no_live_notice without an active row, or with a row that is not live", () => {
    expect(charge({ notice: undefined })).toEqual(
      skip(InactivityFeeSkipReason.NoLiveNotice),
    )
    expect(charge({ notice: notice({ bulletinIssued: false }) })).toEqual(
      skip(InactivityFeeSkipReason.NoLiveNotice),
    )
    expect(
      charge({ notice: notice({ status: InactivityFeeNoticeStatus.Superseded }) }),
    ).toEqual(skip(InactivityFeeSkipReason.NoLiveNotice))
    // acted after the notice, then dormant again by asOf: the notice died mathematically
    expect(
      charge({
        account: account({ lastActivityAt: iso("2025-11-01T00:00:00Z") }),
        notice: notice({ issuedAt: iso("2025-10-01T02:00:00Z") }),
      }),
    ).toEqual(skip(InactivityFeeSkipReason.NoLiveNotice))
  })

  it("skips notice_too_young inside 31 days and charges at exactly 31 days", () => {
    expect(charge({ notice: notice({ issuedAt: iso("2026-11-01T02:00:00Z") }) })).toEqual(
      skip(InactivityFeeSkipReason.NoticeTooYoung),
    )
    // asOf − 31 d exactly
    expect(charge({ notice: notice({ issuedAt: iso("2026-10-15T02:00:00Z") }) })).toEqual(
      {
        outcome: "charge",
      },
    )
    expect(
      charge({ notice: notice({ issuedAt: iso("2026-10-15T02:00:00.001Z") }) }),
    ).toEqual(skip(InactivityFeeSkipReason.NoticeTooYoung))
  })

  it("skips receive_disabled_pre_deadline and jurisdiction from the context", () => {
    expect(
      charge({
        ctx: {
          windDownStatus: WindDownStatus.ReceiveDisabled,
          assignedCountry: undefined,
        },
      }),
    ).toEqual(skip(InactivityFeeSkipReason.ReceiveDisabledPreDeadline))
    expect(
      charge({
        ctx: { windDownStatus: WindDownStatus.GatedClosed, assignedCountry: undefined },
      }),
    ).toEqual({ outcome: "charge" })
    expect(
      charge({
        ctx: { windDownStatus: undefined, assignedCountry: "NL" },
        config: { ...liveConfig, notPermittedCountries: ["NL" as RestrictedCountry] },
      }),
    ).toEqual(skip(InactivityFeeSkipReason.Jurisdiction))
  })

  it("skips zero_balance per wallet: this balance, not the account's", () => {
    expect(charge({ balance: sats(0n) })).toEqual(
      skip(InactivityFeeSkipReason.ZeroBalance),
    )
    expect(charge({ balance: cents(0n) })).toEqual(
      skip(InactivityFeeSkipReason.ZeroBalance),
    )
    expect(charge({ balance: sats(-1n) })).toEqual(
      skip(InactivityFeeSkipReason.ZeroBalance),
    )
    expect(charge({ balance: cents(1n) })).toEqual({ outcome: "charge" })
  })

  it("skips already_debited when the month key exists, after every other check", () => {
    expect(charge({ keyExists: true })).toEqual(
      skip(InactivityFeeSkipReason.AlreadyDebited),
    )
    expect(charge({ keyExists: true, balance: sats(0n) })).toEqual(
      skip(InactivityFeeSkipReason.ZeroBalance),
    )
    expect(
      charge({
        keyExists: true,
        notice: notice({ issuedAt: iso("2026-11-01T02:00:00Z") }),
      }),
    ).toEqual(skip(InactivityFeeSkipReason.NoticeTooYoung))
  })

  it("the account half alone settles flag, status, liveness and age", () => {
    const accountChecks = (overrides: Partial<EvaluateChargeAccountChecksArgs> = {}) =>
      evaluateChargeAccountChecks({
        account: account(),
        notice: notice(),
        asOf: feeAsOf,
        dryRun: false,
        config: liveConfig,
        ...overrides,
      })
    expect(accountChecks()).toEqual({ outcome: "eligible" })
    expect(accountChecks({ config })).toEqual(skip(InactivityFeeSkipReason.FlagOff))
    expect(accountChecks({ notice: undefined })).toEqual(
      skip(InactivityFeeSkipReason.NoLiveNotice),
    )
    expect(
      accountChecks({ notice: notice({ issuedAt: iso("2026-11-01T02:00:00Z") }) }),
    ).toEqual(skip(InactivityFeeSkipReason.NoticeTooYoung))
  })
})

describe("sizeInactivityFee", () => {
  // $77,566/BTC: 7,756,600 cents per 100,000,000 sats
  const ratio = WalletPriceRatio({
    usd: { amount: 7_756_600n, currency: WalletCurrency.Usd },
    btc: { amount: 100_000_000n, currency: WalletCurrency.Btc },
  })
  if (ratio instanceof Error) throw ratio
  const feeAmountUsdCents = toCents(100)

  it("a funded Bitcoin Balance pays floor($1 at the rate) sats", () => {
    expect(
      sizeInactivityFee({ balance: sats(250_000n), feeAmountUsdCents, ratio }),
    ).toEqual({
      btc: { amount: 1289n, currency: WalletCurrency.Btc },
      usd: { amount: 100n, currency: WalletCurrency.Usd },
    })
  })

  it("a funded Dollar Balance pays the fee in cents, the bankowner side at the rate", () => {
    expect(
      sizeInactivityFee({ balance: cents(10_000n), feeAmountUsdCents, ratio }),
    ).toEqual({
      btc: { amount: 1289n, currency: WalletCurrency.Btc },
      usd: { amount: 100n, currency: WalletCurrency.Usd },
    })
  })

  it("a sub-$1 balance pays the whole balance, down to zero", () => {
    expect(sizeInactivityFee({ balance: sats(300n), feeAmountUsdCents, ratio })).toEqual({
      btc: { amount: 300n, currency: WalletCurrency.Btc },
      usd: { amount: 23n, currency: WalletCurrency.Usd },
    })
    expect(sizeInactivityFee({ balance: cents(60n), feeAmountUsdCents, ratio })).toEqual({
      btc: { amount: 774n, currency: WalletCurrency.Btc },
      usd: { amount: 60n, currency: WalletCurrency.Usd },
    })
  })

  it("exactly the fee pays exactly the fee", () => {
    expect(sizeInactivityFee({ balance: sats(1289n), feeAmountUsdCents, ratio })).toEqual(
      {
        btc: { amount: 1289n, currency: WalletCurrency.Btc },
        usd: { amount: 100n, currency: WalletCurrency.Usd },
      },
    )
    expect(sizeInactivityFee({ balance: cents(100n), feeAmountUsdCents, ratio })).toEqual(
      {
        btc: { amount: 1289n, currency: WalletCurrency.Btc },
        usd: { amount: 100n, currency: WalletCurrency.Usd },
      },
    )
  })

  it("never goes below zero", () => {
    expect(sizeInactivityFee({ balance: sats(-5n), feeAmountUsdCents, ratio })).toEqual({
      btc: { amount: 0n, currency: WalletCurrency.Btc },
      usd: { amount: 0n, currency: WalletCurrency.Usd },
    })
  })
})
