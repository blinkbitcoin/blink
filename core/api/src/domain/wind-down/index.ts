export const DEFAULT_WIND_DOWN_REGION_CODE = "default"

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
}: MatchCohortSignalsArgs): CohortCountry | undefined => {
  const affected = new Set(affectedCountries.map((c) => c.toUpperCase()))
  const matchOf = (country: string | undefined): CohortCountry | undefined => {
    const normalized = normalize(country)
    return normalized !== undefined && affected.has(normalized)
      ? (normalized as CohortCountry)
      : undefined
  }

  return (
    matchOf(phoneCountry) ??
    deletedPhoneCountries.map(matchOf).find((matched) => matched !== undefined) ??
    matchOf(creationIpCountry)
  )
}

export const regionForCountry = (
  matchedCountry: CohortCountry | undefined,
  regions: WindDownRegionConfig[],
): WindDownRegionConfig | undefined => {
  if (matchedCountry !== undefined) {
    const specific = regions.find((region) =>
      (region.countries ?? []).some((c) => c.toUpperCase() === matchedCountry),
    )
    if (specific) return specific
  }
  return regions.find((region) => region.code === DEFAULT_WIND_DOWN_REGION_CODE)
}

export const deriveWindDownState = ({
  enabled,
  matched,
  region,
}: DeriveWindDownStateArgs): WindDownState | null => {
  if (!enabled || !matched || !region) return null

  const status = region.gateClosed
    ? WindDownStatus.GatedClosed
    : region.receiveDisabled
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
