import { evaluateWindDownCohortMatch } from "./is-account-in-wind-down-cohort"

import { getWindDownConfig } from "@/config"

import { ReceiveDisabledError, regionForCountry } from "@/domain/wind-down"

const regionArmed = (region: WindDownRegionConfig): boolean =>
  region.receiveDisabled || region.gateClosed

export const checkReceiveAllowed = async ({
  account,
}: {
  account: Account
}): Promise<true | ApplicationError> => {
  const config = getWindDownConfig()
  if (!config.regions.some(regionArmed)) return true

  const match = await evaluateWindDownCohortMatch({ account })
  if (match instanceof Error) return match
  if (!match.matched) return true

  const region = regionForCountry(match.matchedCountry, config.regions)
  if (region === undefined) return true

  return regionArmed(region) ? new ReceiveDisabledError() : true
}
