import { matchCohortSignals, matchedCohortCountry } from "@/domain/wind-down"

const args = (
  overrides: Partial<MatchCohortSignalsArgs> = {},
): MatchCohortSignalsArgs => ({
  phoneCountries: [],
  deletedPhoneCountries: [],
  creationIpCountry: undefined,
  affectedCountries: ["FR", "DE", "IS"],
  ...overrides,
})

describe("matchedCohortCountry", () => {
  it("returns undefined when no signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountries: ["US"], creationIpCountry: "GB" })),
    ).toBeUndefined()
  })

  it("returns the matched country when the current phone country is affected", () => {
    expect(matchedCohortCountry(args({ phoneCountries: ["DE"] }))).toBe("DE")
  })

  it("matches a deleted-phone country when the current phone is non-EU", () => {
    expect(
      matchedCohortCountry(
        args({ phoneCountries: ["US"], deletedPhoneCountries: ["FR"] }),
      ),
    ).toBe("FR")
  })

  it("matches the creation-IP country when no phone signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountries: ["US"], creationIpCountry: "FR" })),
    ).toBe("FR")
  })

  it("matches the creation-IP country when the account has no phone at all", () => {
    expect(matchedCohortCountry(args({ creationIpCountry: "IS" }))).toBe("IS")
  })

  it("prefers the phone country over deleted-phone and creation-IP signals", () => {
    expect(
      matchedCohortCountry(
        args({
          phoneCountries: ["FR"],
          deletedPhoneCountries: ["DE"],
          creationIpCountry: "IS",
        }),
      ),
    ).toBe("FR")
  })

  it("matches case-insensitively", () => {
    expect(matchedCohortCountry(args({ phoneCountries: ["fr"] }))).toBe("FR")
  })

  it("matches any current-phone source, so a non-EU carrier lookup cannot shadow an EU number", () => {
    expect(matchedCohortCountry(args({ phoneCountries: ["US", "FR"] }))).toBe("FR")
  })
})

describe("matchCohortSignals", () => {
  it("is true exactly when matchedCohortCountry is defined", () => {
    const affected = args({ phoneCountries: ["FR"] })
    const notAffected = args({ phoneCountries: ["US"] })

    expect(matchCohortSignals(affected)).toBe(true)
    expect(matchedCohortCountry(affected)).toBeDefined()

    expect(matchCohortSignals(notAffected)).toBe(false)
    expect(matchedCohortCountry(notAffected)).toBeUndefined()
  })
})
