import { AccountLevel } from "./primitives"

export const UnrestrictedCustodialRestrictions: CustodialRestrictions = {
  dollarBalance: false,
  transfer: false,
}

export const checkedToRestrictedCountry = (
  country: string | undefined,
): RestrictedCountry | undefined => {
  const normalized = country?.trim().toUpperCase()
  return normalized && /^[A-Z]{2}$/.test(normalized)
    ? (normalized as RestrictedCountry)
    : undefined
}

// restricted ⊆ registration deny by construction; a registration-only entry never session-blocks
export const toRegistrationDenyCountries = ({
  restrictedCountries,
  denyPhoneCountries,
}: {
  restrictedCountries: RestrictedCountry[]
  denyPhoneCountries: RestrictedCountry[]
}): RestrictedCountry[] => [...new Set([...restrictedCountries, ...denyPhoneCountries])]

export const resolveRestrictions = ({
  phoneCountry,
  ipCountry,
  level,
  dollarBalanceBlockedCountries,
  transferBlockedCountries,
}: ResolveRestrictionsArgs): CustodialRestrictions => {
  const country =
    level === AccountLevel.Zero
      ? checkedToRestrictedCountry(ipCountry)
      : checkedToRestrictedCountry(phoneCountry)
  if (country === undefined) return UnrestrictedCustodialRestrictions

  return {
    dollarBalance: dollarBalanceBlockedCountries.includes(country),
    transfer: transferBlockedCountries.includes(country),
  }
}

// the restricted verdict reads the live connection only — never the phone, and never proxy/risk/ASN
export const resolveSessionRegionVerdict = ({
  ipCountry,
  restrictedCountries,
  registrationDenyCountries,
}: ResolveSessionRegionVerdictArgs): SessionRegionVerdict => {
  const country = checkedToRestrictedCountry(ipCountry)
  if (country === undefined) {
    return { countryCode: undefined, restricted: false, custodialCreationAllowed: true }
  }

  return {
    countryCode: country,
    restricted: restrictedCountries.includes(country),
    custodialCreationAllowed: !registrationDenyCountries.includes(country),
  }
}
