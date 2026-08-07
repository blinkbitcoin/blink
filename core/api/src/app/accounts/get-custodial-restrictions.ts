import { parsePhoneNumberFromString } from "libphonenumber-js"

import { getRegionRestrictionsConfig } from "@/config"

import { ErrorLevel } from "@/domain/shared"
import {
  AccountLevel,
  UnrestrictedCustodialRestrictions,
  resolveRestrictions,
  resolveSessionRegionVerdict,
} from "@/domain/accounts"

import { IpFetcher } from "@/services/ipfetcher"
import { UsersRepository } from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

const unresolved = (signal: "phone" | "ip") => {
  addAttributesToCurrentSpan({ "regionCheck.unresolved": signal })
  return undefined
}

// newest verified phone first, deletedPhones newest-last; removal is not a reset
const countryOfAccountPhone = async (account: Account): Promise<string | undefined> => {
  const user = await UsersRepository().findById(account.kratosUserId)
  if (user instanceof Error) {
    recordExceptionInCurrentSpan({ error: user, level: ErrorLevel.Warn })
    return unresolved("phone")
  }

  const phones = [user.phone, ...[...(user.deletedPhones ?? [])].reverse()]
  for (const phone of phones) {
    const country = phone ? parsePhoneNumberFromString(phone)?.country : undefined
    if (country) return country
  }

  return user.phoneMetadata?.countryCode ?? unresolved("phone")
}

const countryOfRequestIp = async (ip: IpAddress): Promise<string | undefined> => {
  const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
  if (ipInfo instanceof Error) {
    recordExceptionInCurrentSpan({ error: ipInfo, level: ErrorLevel.Warn })
    return unresolved("ip")
  }

  return ipInfo.isoCode || unresolved("ip")
}

export const getCustodialRestrictions = async ({
  account,
  ip,
}: {
  account: Account
  ip?: IpAddress
}): Promise<CustodialRestrictions> => {
  const {
    custodialDollarBalanceBlockedCountries: dollarBalanceBlockedCountries,
    custodialTransferBlockedCountries: transferBlockedCountries,
  } = getRegionRestrictionsConfig()

  if (
    dollarBalanceBlockedCountries.length === 0 &&
    transferBlockedCountries.length === 0
  ) {
    return UnrestrictedCustodialRestrictions
  }

  const isLevelZero = account.level === AccountLevel.Zero
  const ipCountry = isLevelZero && ip ? await countryOfRequestIp(ip) : undefined
  const phoneCountry = isLevelZero ? undefined : await countryOfAccountPhone(account)

  return resolveRestrictions({
    phoneCountry,
    ipCountry,
    level: account.level,
    dollarBalanceBlockedCountries,
    transferBlockedCountries,
  })
}

export const getSessionRegionVerdict = async ({
  ip,
}: {
  ip?: IpAddress
}): Promise<SessionRegionVerdict> => {
  const { sanctionsCountries, registrationDenyCountries } = getRegionRestrictionsConfig()

  const ipCountry = ip ? await countryOfRequestIp(ip) : unresolved("ip")

  return resolveSessionRegionVerdict({
    ipCountry,
    sanctionsCountries,
    registrationDenyCountries,
  })
}
