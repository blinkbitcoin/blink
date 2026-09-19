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
  ledgerLast: Date | undefined
  ipsLast: Date | undefined
  ipsFloor: Date
}

type ResolvedBackfillActivity = {
  value: Date
  source: BackfillActivitySource
}
