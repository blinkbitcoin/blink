import { parsePhoneNumberFromString } from "libphonenumber-js"

import { getWindDownConfig } from "@/config"

import { AccountLevel } from "@/domain/accounts"
import { matchedCohortCountry } from "@/domain/wind-down"
import { CouldNotFindAccountIpError } from "@/domain/errors"

import { UsersRepository } from "@/services/mongoose"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"

const countryOfPhone = (phone: string): string | undefined =>
  parsePhoneNumberFromString(phone)?.country

export const evaluateWindDownCohortMatch = async ({
  account,
}: {
  account: Account
}): Promise<WindDownCohortMatch | ApplicationError> => {
  const { affectedCountries, excludedAccountIds, includeLevelZero } = getWindDownConfig()
  if (excludedAccountIds.includes(account.id)) return { matched: false }

  const levelZeroMatched = includeLevelZero && account.level === AccountLevel.Zero
  if (affectedCountries.length === 0) return { matched: levelZeroMatched }

  const user = await UsersRepository().findById(account.kratosUserId)
  if (user instanceof Error) return user

  const phoneCountry = user.phone ? countryOfPhone(user.phone) : undefined

  const deletedPhoneCountries = (user.deletedPhones ?? [])
    .map(countryOfPhone)
    .filter((country): country is string => country !== undefined)

  // a missing accountips row is an absent signal, not an error: the collection is written
  // on first authenticated request, not at signup, so older accounts have no row
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

  if (matchedCountry !== undefined) return { matched: true, matchedCountry }

  return { matched: levelZeroMatched }
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
