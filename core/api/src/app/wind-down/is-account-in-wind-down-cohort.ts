import { parsePhoneNumberFromString } from "libphonenumber-js"

import { getWindDownConfig } from "@/config"

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
  const { affectedCountries } = getWindDownConfig()
  if (affectedCountries.length === 0) return { matched: false }

  const user = await UsersRepository().findById(account.kratosUserId)
  if (user instanceof Error) return user

  const phoneCountry = user.phone ? countryOfPhone(user.phone) : undefined

  const deletedPhoneCountries = (user.deletedPhones ?? [])
    .map(countryOfPhone)
    .filter((country): country is string => country !== undefined)

  let creationIpCountry: string | undefined

  const earliestIp = await AccountsIpsRepository().findEarliestByAccountId(account.id)
  if (earliestIp instanceof CouldNotFindAccountIpError) {
    // accountips is written on first authenticated request, not at signup: older accounts have no row
    creationIpCountry = undefined
  } else if (earliestIp instanceof Error) {
    return earliestIp
  } else {
    // metadata is absent on rows recorded before geo lookup succeeded, despite AccountIP typing it required
    creationIpCountry = earliestIp.metadata?.isoCode
  }

  const matchedCountry = matchedCohortCountry({
    phoneCountry,
    deletedPhoneCountries,
    creationIpCountry,
    affectedCountries,
  })

  return { matched: matchedCountry !== undefined, matchedCountry }
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
