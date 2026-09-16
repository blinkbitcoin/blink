import { createHash, randomUUID } from "crypto"

import { InactivityFeeImportVerdict } from "./primitives"

// the 15th of the month after the notice was issued, midnight UTC
export const firstChargeableFifteenth = ({ issuedAt }: { issuedAt: Date }): Date =>
  new Date(Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth() + 1, 15))

// The date named in the notice copy: never before the fee itself applies. If effectiveFrom
// slips past the 15th after issue, the later instant wins.
export const noticeEffectiveDate = ({
  issuedAt,
  effectiveFrom,
}: {
  issuedAt: Date
  effectiveFrom: Date
}): Date => {
  const fifteenth = firstChargeableFifteenth({ issuedAt })
  return fifteenth.getTime() >= effectiveFrom.getTime() ? fifteenth : effectiveFrom
}

// YYYY-MM-DD in UTC: the only date shape shown to users and passed to the notifications service
export const formatIsoDate = ({ date }: { date: Date }): string =>
  date.toISOString().slice(0, 10)

export const noticeRunId = ({ asOf }: { asOf: Date }): string =>
  `notice-${formatIsoDate({ date: asOf })}-${randomUUID()}`

// order-independent fingerprint of the skip list a run used
export const skipListHash = ({ skipAccountIds }: { skipAccountIds: string[] }): string =>
  createHash("sha256")
    .update([...skipAccountIds].sort().join("\n"))
    .digest("hex")

// the cron gate: the monthly notice run fires only on the 1st, UTC
export const isFirstOfMonthUtc = ({ date }: { date: Date }): boolean =>
  date.getUTCDate() === 1

// On-demand runs are live only for today's UTC date; any other asOf is a dry run whatever was
// asked for (a missed 1st is never re-run live for a past date). `forcedDry` records that a
// live request was downgraded.
export const resolveOnDemandMode = ({
  live,
  asOf,
  now,
}: {
  live: boolean
  asOf: Date
  now: Date
}): { dryRun: boolean; forcedDry: boolean } => {
  if (live && formatIsoDate({ date: asOf }) === formatIsoDate({ date: now })) {
    return { dryRun: false, forcedDry: false }
  }
  return { dryRun: true, forcedDry: live }
}

// The 2026-09-03 import guard (acceptance case A7): a candidate is inserted only when its clock
// is known, it did not act at or after the send, and no active row is on file. The same rule
// makes a re-run report every earlier insert as already_active.
export const checkImportCandidate = ({
  lastActivityAt,
  issuedAt,
  hasActiveNotice,
}: {
  lastActivityAt: Date | undefined
  issuedAt: Date
  hasActiveNotice: boolean
}): InactivityFeeImportVerdict => {
  if (lastActivityAt === undefined) return InactivityFeeImportVerdict.NoActivityClock
  if (lastActivityAt.getTime() >= issuedAt.getTime()) {
    return InactivityFeeImportVerdict.ActivityAfterIssue
  }
  if (hasActiveNotice) return InactivityFeeImportVerdict.AlreadyActive
  return InactivityFeeImportVerdict.Ok
}
