type ActivityKind =
  (typeof import("./index").ActivityKind)[keyof typeof import("./index").ActivityKind]

type BackfillActivitySource =
  (typeof import("./index").BackfillActivitySource)[keyof typeof import("./index").BackfillActivitySource]

type CalendarMonthsBeforeArgs = {
  date: Date
  months: number
}

type IsDormantAtArgs = {
  lastActivityAt: Date
  asOf: Date
}

type ResolveBackfillActivityArgs = {
  // value already stored on the account (live instrumentation or an earlier run)
  existing: Date | undefined
  createdAt: Date
  // last user-initiated ledger entry (sender leg); undefined when there is none
  ledgerLast: Date | undefined
  // max accountips.lastConnection across both id spaces; undefined when there is no row
  ipsLast: Date | undefined
  // stands in for ipsLast when accountips history is missing (documented cutoff)
  ipsFloor: Date
}

type ResolvedBackfillActivity = {
  value: Date
  source: BackfillActivitySource
}
