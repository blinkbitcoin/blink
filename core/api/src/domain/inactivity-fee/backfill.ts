export const BackfillActivitySource = {
  Existing: "existing",
  Created: "created",
  Ledger: "ledger",
  AccountIps: "accountips",
  Floor: "floor",
} as const

// the floor is a minimum for accountips evidence, whether or not a row exists
// ties go to evidence before `existing`, so a re-run reports the same sources
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
