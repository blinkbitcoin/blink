import { parsePhoneNumberFromString } from "libphonenumber-js"

import { getWindDownConfig, SECS_PER_5_MINS } from "@/config"

import { matchedCohortCountry } from "@/domain/wind-down"
import { CouldNotFindAccountIpError } from "@/domain/errors"

import { UsersRepository } from "@/services/mongoose"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"
import { LocalCacheService } from "@/services/cache/local-cache"

const cacheKeyFor = (accountId: AccountId): string => `wind-down:cohort:${accountId}`

export const evaluateWindDownCohortMatch = async ({
  account,
}: {
  account: Account
}): Promise<WindDownCohortMatch | ApplicationError> => {
  if (account.windDownExempt) return { matched: false }

  const cache = LocalCacheService()
  const cacheKey = cacheKeyFor(account.id)

  const cached = await cache.get<WindDownCohortMatch>({ key: cacheKey })
  if (!(cached instanceof Error)) return cached

  const { affectedCountries } = getWindDownConfig()
  if (affectedCountries.length === 0) return { matched: false }

  const user = await UsersRepository().findById(account.kratosUserId)
  if (user instanceof Error) return user

  const phoneCountry = user.phoneMetadata?.countryCode
  const deletedPhoneCountries = (user.deletedPhones ?? [])
    .map((phone) => parsePhoneNumberFromString(phone)?.country as string | undefined)
    .filter((country): country is string => country !== undefined)

  const earliestIp = await AccountsIpsRepository().findEarliestByAccountId(account.id)
  if (
    earliestIp instanceof Error &&
    !(earliestIp instanceof CouldNotFindAccountIpError)
  ) {
    return earliestIp
  }
  // metadata is absent on rows recorded before geo lookup succeeded, despite AccountIP typing it required
  const creationIpCountry =
    earliestIp instanceof Error ? undefined : earliestIp.metadata?.isoCode

  const matchedCountry = matchedCohortCountry({
    phoneCountry,
    deletedPhoneCountries,
    creationIpCountry,
    affectedCountries,
  })

  const match: WindDownCohortMatch = {
    matched: matchedCountry !== undefined,
    matchedCountry,
  }

  await cache.set<WindDownCohortMatch>({
    key: cacheKey,
    value: match,
    ttlSecs: SECS_PER_5_MINS,
  })

  return match
}

export const isAccountInWindDownCohort = async ({
  account,
}: {
  account: Account
}): Promise<boolean | ApplicationError> => {
  const match = await evaluateWindDownCohortMatch({ account })
  if (match instanceof Error) return match

  return match.matched
}
