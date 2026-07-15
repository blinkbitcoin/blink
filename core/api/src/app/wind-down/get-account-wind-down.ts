import { evaluateWindDownCohortMatch } from "./is-account-in-wind-down-cohort"

import { getWindDownConfig } from "@/config"

import { deriveWindDownState, regionForCountry } from "@/domain/wind-down"

export const getAccountWindDown = async ({
  account,
}: {
  account: Account
}): Promise<WindDownState | null | ApplicationError> => {
  const config = getWindDownConfig()
  if (!config.enabled) return null

  const match = await evaluateWindDownCohortMatch({ account })
  if (match instanceof Error) return match
  if (!match.matched) return null

  const region = regionForCountry(match.matchedCountry, config.regions)
  return deriveWindDownState({
    enabled: config.enabled,
    matched: match.matched,
    region,
  })
}
