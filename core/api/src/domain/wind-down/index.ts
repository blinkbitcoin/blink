export const WindDownStatus = {
  PreCutoff: "PRE_CUTOFF",
  ReceiveDisabled: "RECEIVE_DISABLED",
  GatedClosed: "GATED_CLOSED",
} as const

const normalize = (country: string | undefined): string | undefined =>
  country ? country.toUpperCase() : undefined

export const matchedCohortCountry = ({
  phoneCountry,
  deletedPhoneCountries,
  creationIpCountry,
  affectedCountries,
}: MatchCohortSignalsArgs): string | undefined => {
  const affected = new Set(affectedCountries.map((c) => c.toUpperCase()))
  const matchOf = (country: string | undefined): string | undefined => {
    const normalized = normalize(country)
    return normalized !== undefined && affected.has(normalized) ? normalized : undefined
  }

  const byPhone = matchOf(phoneCountry)
  if (byPhone !== undefined) return byPhone

  for (const deleted of deletedPhoneCountries) {
    const byDeletedPhone = matchOf(deleted)
    if (byDeletedPhone !== undefined) return byDeletedPhone
  }

  return matchOf(creationIpCountry)
}

export const matchCohortSignals = (args: MatchCohortSignalsArgs): boolean =>
  matchedCohortCountry(args) !== undefined

export const regionForCountry = (
  matchedCountry: string | undefined,
  regions: WindDownRegionConfig[],
): WindDownRegionConfig | undefined => {
  const normalized = normalize(matchedCountry)
  if (normalized !== undefined) {
    const specific = regions.find((region) =>
      (region.countries ?? []).some((c) => c.toUpperCase() === normalized),
    )
    if (specific) return specific
  }
  return regions.find((region) => region.code === "default")
}

export const deriveWindDownState = ({
  enabled,
  exempt,
  matched,
  region,
}: DeriveWindDownStateArgs): WindDownState | null => {
  if (!enabled || exempt || !matched || !region) return null

  const status = region.gate.enabled
    ? WindDownStatus.GatedClosed
    : region.receiveDisable.enabled
      ? WindDownStatus.ReceiveDisabled
      : WindDownStatus.PreCutoff

  return {
    status,
    receiveDisabledAt: region.receiveDisabledAt,
    finalDeadline: region.finalDeadline,
    gateArmsAt: region.gateArmsAt,
    timezone: region.timezone,
  }
}
