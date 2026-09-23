import { AccountLevel, AccountStatus } from "@/domain/accounts"
import {
  evaluateAccountEligibility,
  InactivityFeeSkipReason,
} from "@/domain/inactivity-fee"
import { toCents } from "@/domain/fiat"
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
