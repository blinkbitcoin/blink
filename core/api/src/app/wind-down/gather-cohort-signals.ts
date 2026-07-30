import { parsePhoneNumberFromString } from "libphonenumber-js"

import { CouldNotFindAccountIpError } from "@/domain/errors"

import { UsersRepository } from "@/services/mongoose"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"

export const countryOfPhone = (phone: string): string | undefined =>
  parsePhoneNumberFromString(phone)?.country

export const gatherCohortSignals = async ({
  accountId,
  kratosUserId,
  ipEvidenceCutoff,
}: {
  accountId: AccountId
  kratosUserId: UserId
  ipEvidenceCutoff?: Date
}): Promise<WindDownCohortSignals | RepositoryError> => {
  const user = await UsersRepository().findById(kratosUserId)
  if (user instanceof Error) return user

  const phoneCountry = user.phone ? countryOfPhone(user.phone) : undefined

  // deletedPhones is stored append-only with the newest phone last; the matcher contract
  // is newest-first with unparsable entries kept as undefined holes
  const deletedPhoneCountries = [...(user.deletedPhones ?? [])]
    .reverse()
    .map(countryOfPhone)

  const accountsIps = AccountsIpsRepository()

  // a missing accountips row is an absent signal, not an error: the collection is written
  // on first authenticated request, not at signup, so older accounts have no row
  const earliestIp = await accountsIps.findEarliestByAccountId(accountId)
  if (
    earliestIp instanceof Error &&
    !(earliestIp instanceof CouldNotFindAccountIpError)
  ) {
    return earliestIp
  }

  // metadata is absent on rows recorded before geo lookup succeeded, despite AccountIP typing it required
  const creationIpCountry =
    earliestIp instanceof Error ? undefined : earliestIp.metadata?.isoCode

  if (ipEvidenceCutoff === undefined) {
    return { phoneCountry, deletedPhoneCountries, creationIpCountry }
  }

  const latestIp = await accountsIps.findLastByAccountIdBefore({
    accountId,
    cutoff: ipEvidenceCutoff,
  })
  if (latestIp instanceof Error && !(latestIp instanceof CouldNotFindAccountIpError)) {
    return latestIp
  }

  const latestIpCountry =
    latestIp instanceof Error ? undefined : latestIp.metadata?.isoCode

  return { phoneCountry, deletedPhoneCountries, creationIpCountry, latestIpCountry }
}
