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
  const firstMatch = (countries: string[]): string | undefined => {
    for (const country of countries) {
      const matched = matchOf(country)
      if (matched !== undefined) return matched
    }
    return undefined
  }

  return (
    matchOf(phoneCountry) ??
    firstMatch(deletedPhoneCountries) ??
    matchOf(creationIpCountry)
  )
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
  matched,
  region,
}: DeriveWindDownStateArgs): WindDownState | null => {
  if (!enabled || !matched || !region) return null

  const status = region.gateClosed.enabled
    ? WindDownStatus.GatedClosed
    : region.receiveDisabled.enabled
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
