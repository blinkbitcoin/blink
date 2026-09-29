import { AccountLevel, AccountStatus } from "@/domain/accounts"
import {
  checkImportCandidate,
  feeChargeCutoff,
  feeRunId,
  firstChargeableFifteenth,
  formatIsoDate,
  InactivityFeeImportVerdict,
  InactivityFeeNoticeSource,
  InactivityFeeNoticeStatus,
  InactivityFeeTemplateVersion,
  isFifteenthOfMonthUtc,
  isFirstOfMonthUtc,
  isNoticeLive,
  noticeEffectiveDate,
  noticeRunId,
  resolveOnDemandMode,
  skipListHash,
} from "@/domain/inactivity-fee"

const iso = (value: string) => new Date(value)

const account = (lastActivityAt: Date | undefined): Account => ({
  id: "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId,
  createdAt: iso("2020-01-01T00:00:00Z"),
  defaultWalletId: "wallet" as WalletId,
  withdrawFee: undefined,
  level: AccountLevel.One,
  status: AccountStatus.Active,
  statusHistory: [],
  contactEnabled: true,
  kratosUserId: "user" as UserId,
  displayCurrency: "USD" as DisplayCurrency,
  lastActivityAt,
})

const notice = (overrides: Partial<InactivityFeeNotice> = {}): InactivityFeeNotice => ({
  id: "notice" as InactivityFeeNoticeId,
  accountId: "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId,
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

describe("isNoticeLive", () => {
  const dormantSince = iso("2025-08-01T00:00:00Z")

  it("is live for an active, issued row newer than the last activity", () => {
    expect(isNoticeLive({ notice: notice(), account: account(dormantSince) })).toBe(true)
  })

  it("is not live when the bulletin was never issued (send failed)", () => {
    expect(
      isNoticeLive({
        notice: notice({ bulletinIssued: false }),
        account: account(dormantSince),
      }),
    ).toBe(false)
  })

  it("is not live once superseded", () => {
    expect(
      isNoticeLive({
        notice: notice({ status: InactivityFeeNoticeStatus.Superseded }),
        account: account(dormantSince),
      }),
    ).toBe(false)
  })

  it("dies mathematically when the account acts after it was issued", () => {
    expect(
      isNoticeLive({ notice: notice(), account: account(iso("2026-10-02T00:00:00Z")) }),
    ).toBe(false)
  })

  it("is not live when activity is exactly at the issue instant", () => {
    expect(
      isNoticeLive({ notice: notice(), account: account(iso("2026-10-01T02:00:00Z")) }),
    ).toBe(false)
  })

  it("is not live for an account whose clock was never backfilled", () => {
    expect(isNoticeLive({ notice: notice(), account: account(undefined) })).toBe(false)
  })
})

describe("firstChargeableFifteenth", () => {
  it("is the 15th of the following month", () => {
    expect(firstChargeableFifteenth({ issuedAt: iso("2026-09-03T14:22:00Z") })).toEqual(
      iso("2026-10-15T00:00:00Z"),
    )
  })

  it("ignores the day of the month the notice was issued on", () => {
    expect(firstChargeableFifteenth({ issuedAt: iso("2026-10-31T23:59:59Z") })).toEqual(
      iso("2026-11-15T00:00:00Z"),
    )
  })

  it("crosses the year end", () => {
    expect(firstChargeableFifteenth({ issuedAt: iso("2026-12-01T02:00:00Z") })).toEqual(
      iso("2027-01-15T00:00:00Z"),
    )
  })
})

describe("noticeEffectiveDate", () => {
  it("is the 15th after issue when the fee already applies by then", () => {
    expect(
      noticeEffectiveDate({
        issuedAt: iso("2026-10-01T02:00:00Z"),
        effectiveFrom: iso("2026-10-15T00:00:00Z"),
      }),
    ).toEqual(iso("2026-11-15T00:00:00Z"))
  })

  it("never names a date before effectiveFrom", () => {
    expect(
      noticeEffectiveDate({
        issuedAt: iso("2026-09-03T14:22:00Z"),
        effectiveFrom: iso("2026-11-15T00:00:00Z"),
      }),
    ).toEqual(iso("2026-11-15T00:00:00Z"))
  })

  it("keeps the 15th when it equals effectiveFrom", () => {
    expect(
      noticeEffectiveDate({
        issuedAt: iso("2026-09-03T14:22:00Z"),
        effectiveFrom: iso("2026-10-15T00:00:00Z"),
      }),
    ).toEqual(iso("2026-10-15T00:00:00Z"))
  })
})

describe("formatIsoDate", () => {
  it("renders the UTC calendar day only", () => {
    expect(formatIsoDate({ date: iso("2026-10-15T23:59:59.999Z") })).toBe("2026-10-15")
  })
})

describe("noticeRunId", () => {
  it("carries the asOf day and a unique suffix", () => {
    const a = noticeRunId({ asOf: iso("2026-10-01T02:00:00Z") })
    const b = noticeRunId({ asOf: iso("2026-10-01T02:00:00Z") })
    expect(a).toMatch(/^notice-2026-10-01-[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })
})

describe("skipListHash", () => {
  it("does not depend on order and changes with content", () => {
    const ab = skipListHash({ skipAccountIds: ["a", "b"] })
    expect(skipListHash({ skipAccountIds: ["b", "a"] })).toBe(ab)
    expect(skipListHash({ skipAccountIds: ["a"] })).not.toBe(ab)
    expect(skipListHash({ skipAccountIds: [] })).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe("feeRunId", () => {
  it("carries the asOf day and a unique suffix", () => {
    const a = feeRunId({ asOf: iso("2026-10-15T02:00:00Z") })
    const b = feeRunId({ asOf: iso("2026-10-15T02:00:00Z") })
    expect(a).toMatch(/^fee-2026-10-15-[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })
})

describe("feeChargeCutoff", () => {
  it("is exactly 31 days before asOf, to the millisecond", () => {
    expect(feeChargeCutoff({ asOf: iso("2026-11-15T02:00:00Z") })).toEqual(
      iso("2026-10-15T02:00:00Z"),
    )
    expect(feeChargeCutoff({ asOf: iso("2026-03-15T00:00:00Z") })).toEqual(
      iso("2026-02-12T00:00:00Z"),
    )
  })
})

describe("isFifteenthOfMonthUtc", () => {
  it("opens the cron gate only on the 15th, in UTC", () => {
    expect(isFifteenthOfMonthUtc({ date: iso("2026-10-15T02:00:00Z") })).toBe(true)
    expect(isFifteenthOfMonthUtc({ date: iso("2026-10-15T00:00:00Z") })).toBe(true)
    expect(isFifteenthOfMonthUtc({ date: iso("2026-10-16T02:00:00Z") })).toBe(false)
    expect(isFifteenthOfMonthUtc({ date: iso("2026-10-01T02:00:00Z") })).toBe(false)
    // 15th local time in UTC+7 is still the 14th in UTC
    expect(isFifteenthOfMonthUtc({ date: iso("2026-10-14T23:30:00Z") })).toBe(false)
  })
})

describe("isFirstOfMonthUtc", () => {
  it("opens the cron gate only on the 1st, in UTC", () => {
    expect(isFirstOfMonthUtc({ date: iso("2026-10-01T02:00:00Z") })).toBe(true)
    expect(isFirstOfMonthUtc({ date: iso("2026-10-02T02:00:00Z") })).toBe(false)
    // 1st local time in UTC+7 is still the last day of the month in UTC
    expect(isFirstOfMonthUtc({ date: iso("2026-09-30T23:30:00Z") })).toBe(false)
    expect(isFirstOfMonthUtc({ date: iso("2026-10-01T00:00:00Z") })).toBe(true)
  })
})

describe("resolveOnDemandMode", () => {
  const now = iso("2026-09-16T04:00:00Z")

  it("defaults to a dry run", () => {
    expect(
      resolveOnDemandMode({ live: false, asOf: iso("2026-09-16T00:00:00Z"), now }),
    ).toEqual({
      dryRun: true,
      forcedDry: false,
    })
  })

  it("runs live only when asked for and asOf is today's UTC date", () => {
    expect(
      resolveOnDemandMode({ live: true, asOf: iso("2026-09-16T00:00:00Z"), now }),
    ).toEqual({
      dryRun: false,
      forcedDry: false,
    })
  })

  it("downgrades --live for any other date and records the downgrade (A12)", () => {
    expect(
      resolveOnDemandMode({ live: true, asOf: iso("2026-09-01T00:00:00Z"), now }),
    ).toEqual({
      dryRun: true,
      forcedDry: true,
    })
    expect(
      resolveOnDemandMode({ live: true, asOf: iso("2026-10-01T00:00:00Z"), now }),
    ).toEqual({
      dryRun: true,
      forcedDry: true,
    })
  })
})

describe("checkImportCandidate", () => {
  const issuedAt = iso("2026-09-03T14:22:00Z")

  it("accepts a dormant candidate with no active row", () => {
    expect(
      checkImportCandidate({
        lastActivityAt: iso("2025-01-01T00:00:00Z"),
        issuedAt,
        hasActiveNotice: false,
      }),
    ).toBe(InactivityFeeImportVerdict.Ok)
  })

  it("rejects a candidate whose clock was never backfilled", () => {
    expect(
      checkImportCandidate({
        lastActivityAt: undefined,
        issuedAt,
        hasActiveNotice: false,
      }),
    ).toBe(InactivityFeeImportVerdict.NoActivityClock)
  })

  it("rejects a candidate born dead: activity at or after the send (A7)", () => {
    expect(
      checkImportCandidate({
        lastActivityAt: issuedAt,
        issuedAt,
        hasActiveNotice: false,
      }),
    ).toBe(InactivityFeeImportVerdict.ActivityAfterIssue)
    expect(
      checkImportCandidate({
        lastActivityAt: iso("2026-09-10T00:00:00Z"),
        issuedAt,
        hasActiveNotice: false,
      }),
    ).toBe(InactivityFeeImportVerdict.ActivityAfterIssue)
  })

  it("reports an existing active row so a re-run inserts nothing", () => {
    expect(
      checkImportCandidate({
        lastActivityAt: iso("2025-01-01T00:00:00Z"),
        issuedAt,
        hasActiveNotice: true,
      }),
    ).toBe(InactivityFeeImportVerdict.AlreadyActive)
  })
})
