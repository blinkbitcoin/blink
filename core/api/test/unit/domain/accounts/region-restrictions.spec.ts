import {
  AccountLevel,
  resolveRestrictions,
  resolveSessionRegionVerdict,
  toRegistrationDenyCountries,
} from "@/domain/accounts"

const countries = (...codes: string[]) => codes as RestrictedCountry[]

const restrictions = (args: Partial<ResolveRestrictionsArgs> = {}) =>
  resolveRestrictions({
    level: AccountLevel.One,
    dollarBalanceBlockedCountries: countries("NG"),
    transferBlockedCountries: countries("TR"),
    ...args,
  })

const verdict = (args: Partial<ResolveSessionRegionVerdictArgs> = {}) =>
  resolveSessionRegionVerdict({
    sanctionsCountries: countries("IR"),
    registrationDenyCountries: countries("IR", "PK"),
    ...args,
  })

describe("toRegistrationDenyCountries", () => {
  it("is empty when both inputs are empty, so registration policy is untouched", () => {
    expect(
      toRegistrationDenyCountries({
        sanctionsCountries: [],
        denyPhoneCountries: [],
      }),
    ).toEqual([])
  })

  it("contains every sanctioned country", () => {
    expect(
      toRegistrationDenyCountries({
        sanctionsCountries: countries("IR", "KP"),
        denyPhoneCountries: countries("PK"),
      }),
    ).toEqual(["IR", "KP", "PK"])
  })

  it("deduplicates a country listed on both sides", () => {
    expect(
      toRegistrationDenyCountries({
        sanctionsCountries: countries("IR"),
        denyPhoneCountries: countries("IR", "PK"),
      }),
    ).toEqual(["IR", "PK"])
  })
})

describe("resolveRestrictions", () => {
  it("derives an L1 verdict from the phone country", () => {
    expect(restrictions({ phoneCountry: "NG" })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
    expect(restrictions({ phoneCountry: "TR" })).toEqual({
      dollarBalance: false,
      transfer: true,
    })
  })

  it("derives an L2 verdict from the phone country", () => {
    expect(restrictions({ phoneCountry: "NG", level: AccountLevel.Two })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
  })

  it("leaves an L1 verdict unrestricted for an unlisted phone country", () => {
    expect(restrictions({ phoneCountry: "SV" })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("ignores the request IP for L1+ so travel and VPNs cannot move the verdict", () => {
    expect(restrictions({ phoneCountry: "SV", ipCountry: "NG" })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("derives an L0 verdict from the request IP", () => {
    expect(restrictions({ ipCountry: "NG", level: AccountLevel.Zero })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
  })

  it("ignores a phone country for L0", () => {
    expect(
      restrictions({ phoneCountry: "NG", ipCountry: "SV", level: AccountLevel.Zero }),
    ).toEqual({ dollarBalance: false, transfer: false })
  })

  it("fails open when the phone country is absent", () => {
    expect(restrictions({})).toEqual({ dollarBalance: false, transfer: false })
  })

  it("fails open when the phone country is empty", () => {
    expect(restrictions({ phoneCountry: "" })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("fails open when an L0 request IP is unresolvable", () => {
    expect(restrictions({ level: AccountLevel.Zero })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("fails open on a country that is not alpha-2", () => {
    expect(restrictions({ phoneCountry: "NGA" })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("normalizes case and surrounding whitespace", () => {
    expect(restrictions({ phoneCountry: " ng " })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
  })

  it("is unrestricted for every country when the lists are empty", () => {
    expect(
      restrictions({
        phoneCountry: "NG",
        dollarBalanceBlockedCountries: [],
        transferBlockedCountries: [],
      }),
    ).toEqual({ dollarBalance: false, transfer: false })
  })

  it("reports both restrictions when a country is on both lists", () => {
    expect(
      restrictions({
        phoneCountry: "NG",
        dollarBalanceBlockedCountries: countries("NG"),
        transferBlockedCountries: countries("NG"),
      }),
    ).toEqual({ dollarBalance: true, transfer: true })
  })
})

describe("resolveSessionRegionVerdict", () => {
  it("returns a clean verdict for an unlisted country", () => {
    expect(verdict({ ipCountry: "SV" })).toEqual({
      countryCode: "SV",
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("marks a sanctioned country and blocks creation there", () => {
    expect(verdict({ ipCountry: "IR" })).toEqual({
      countryCode: "IR",
      restricted: true,
      custodialCreationAllowed: false,
    })
  })

  it("blocks creation without sanctioning for a registration-only country", () => {
    expect(verdict({ ipCountry: "PK" })).toEqual({
      countryCode: "PK",
      restricted: false,
      custodialCreationAllowed: false,
    })
  })

  it("fails open with no country when the IP is unresolvable", () => {
    expect(verdict({})).toEqual({
      countryCode: undefined,
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("fails open when the resolver returns an empty country", () => {
    expect(verdict({ ipCountry: "" })).toEqual({
      countryCode: undefined,
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("is clean for every country when the lists are empty", () => {
    expect(
      verdict({ ipCountry: "IR", sanctionsCountries: [], registrationDenyCountries: [] }),
    ).toEqual({
      countryCode: "IR",
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("normalizes case", () => {
    expect(verdict({ ipCountry: "ir" }).restricted).toBe(true)
  })
})
