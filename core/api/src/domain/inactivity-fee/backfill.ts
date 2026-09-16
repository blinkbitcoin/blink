export const BackfillActivitySource = {
  Existing: "existing",
  Created: "created",
  Ledger: "ledger",
  AccountIps: "accountips",
  Floor: "floor",
} as const

// The floor means "absence of accountips history cannot be proven before this date", so it is a
// minimum for the accountips candidate whether a row exists or not: an ipsLast before the floor
// counts as `floor`, only an ipsLast strictly after it counts as `accountips`.
// Ties go to evidence before `existing`, so a re-run reports the same sources as the first run
// (the stored value then equals the evidence) and only a strictly newer live value reads as
// `existing`. The write itself is a $max, so this never lowers a live value either way.
export const resolveBackfillActivity = ({
  existing,
  createdAt,
  ledgerLast,
  ipsLast,
  ipsFloor,
}: ResolveBackfillActivityArgs): ResolvedBackfillActivity => {
  const candidates: ResolvedBackfillActivity[] = [
    ...(ledgerLast ? [{ value: ledgerLast, source: BackfillActivitySource.Ledger }] : []),
    ipsLast && ipsLast.getTime() > ipsFloor.getTime()
      ? { value: ipsLast, source: BackfillActivitySource.AccountIps }
      : { value: ipsFloor, source: BackfillActivitySource.Floor },
    { value: createdAt, source: BackfillActivitySource.Created },
    ...(existing ? [{ value: existing, source: BackfillActivitySource.Existing }] : []),
  ]

  return candidates.reduce((best, candidate) =>
    candidate.value.getTime() > best.value.getTime() ? candidate : best,
  )
}
