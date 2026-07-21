import { evaluateWindDownCohortMatch } from "./is-account-in-wind-down-cohort"

import { getWindDownConfig } from "@/config"

import { ReceiveDisabledError, regionForCountry } from "@/domain/wind-down"

const anyRegionArmed = (regions: WindDownRegionConfig[]): boolean =>
  regions.some((region) => region.receiveDisabled || region.gateClosed)

export const isReceiveEnforcementArmed = (): boolean =>
  anyRegionArmed(getWindDownConfig().regions)

export const checkReceiveAllowed = async ({
  account,
}: {
  account: Account
}): Promise<true | ApplicationError> => {
  const config = getWindDownConfig()
  if (!anyRegionArmed(config.regions)) return true

  const match = await evaluateWindDownCohortMatch({ account })
  if (match instanceof Error) return match
  if (!match.matched) return true

  const region = regionForCountry(match.matchedCountry, config.regions)
  if (region === undefined) return true

  return region.receiveDisabled || region.gateClosed ? new ReceiveDisabledError() : true
}
