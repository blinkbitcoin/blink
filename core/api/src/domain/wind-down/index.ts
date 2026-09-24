import { AccountLevel } from "@/domain/accounts"

export * from "./errors"

export const DEFAULT_WIND_DOWN_REGION_CODE = "default"
export const LEVEL_ZERO_WIND_DOWN_REGION_CODE = "level-zero"

export const WindDownCohortRule = {
  StrictList: "strict-list",
  Hierarchy: "hierarchy",
  ExclusionOverride: "exclusion-override",
} as const

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

export const assessCohortResidency = ({
  phoneCountry,
  newestDeletedPhoneCountry,
  creationIpCountry,
  latestIpCountry,
  affectedCountries,
  strictCountries,
}: AssessCohortResidencyArgs): CohortResidencyVerdict => {
  const affected = new Set(affectedCountries.map((c) => c.toUpperCase()))
  const strict = new Set(strictCountries.map((c) => c.toUpperCase()))
  const isAffected = (country: string | undefined): country is string =>
    country !== undefined && affected.has(country)

  const phone = normalize(phoneCountry)
  const newestDeleted = normalize(newestDeletedPhoneCountry)
  const creationIp = normalize(creationIpCountry)
  const latestIp = normalize(latestIpCountry)

  // latest IP is never an inclusion signal
  const strictMatch = [phone, newestDeleted, creationIp].find(
    (country) => country !== undefined && strict.has(country),
  )
  if (strictMatch !== undefined) {
    return {
      matched: true,
      assignedCountry: strictMatch as CohortCountry,
      rule: WindDownCohortRule.StrictList,
    }
  }

  const primary = phone ?? newestDeleted ?? creationIp
  if (primary === undefined) {
    return { matched: false, rule: WindDownCohortRule.Hierarchy }
  }

  if (!isAffected(primary)) {
    return {
      matched: false,
      assignedCountry: primary as CohortCountry,
      rule: WindDownCohortRule.Hierarchy,
    }
  }

  const residencyOverridesOut =
    creationIp !== undefined && creationIp === latestIp && !isAffected(creationIp)
  if (residencyOverridesOut) {
    return {
      matched: false,
      assignedCountry: creationIp as CohortCountry,
      rule: WindDownCohortRule.ExclusionOverride,
    }
  }

  return {
    matched: true,
    assignedCountry: primary as CohortCountry,
    rule: WindDownCohortRule.Hierarchy,
  }
}

export const resolveWindDownRegion = ({
  matchedCountry,
  level,
  regions,
}: ResolveWindDownRegionArgs): WindDownRegionConfig | undefined => {
  const byCode = (code: string) => regions.find((region) => region.code === code)
  const defaultRegion = byCode(DEFAULT_WIND_DOWN_REGION_CODE)

  if (matchedCountry !== undefined) {
    return (
      regions.find(
        (region) =>
          region.code !== LEVEL_ZERO_WIND_DOWN_REGION_CODE &&
          (region.countries ?? []).some((c) => c.toUpperCase() === matchedCountry),
      ) ?? defaultRegion
    )
  }

  return level === AccountLevel.Zero
    ? (byCode(LEVEL_ZERO_WIND_DOWN_REGION_CODE) ?? defaultRegion)
    : defaultRegion
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
