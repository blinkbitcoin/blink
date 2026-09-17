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
  existing: Date | undefined
  createdAt: Date
  // sender legs only
  ledgerLast: Date | undefined
  // across both accountips id spaces
  ipsLast: Date | undefined
  // used when accountips history is missing
  ipsFloor: Date
}

type ResolvedBackfillActivity = {
  value: Date
  source: BackfillActivitySource
}
