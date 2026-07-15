import { matchedCohortCountry } from "@/domain/wind-down"

const args = (
  overrides: Partial<MatchCohortSignalsArgs> = {},
): MatchCohortSignalsArgs => ({
  phoneCountry: undefined,
  deletedPhoneCountries: [],
  creationIpCountry: undefined,
  affectedCountries: ["FR", "DE", "IS"],
  ...overrides,
})

describe("matchedCohortCountry", () => {
  it("returns undefined when no signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "US", creationIpCountry: "GB" })),
    ).toBeUndefined()
  })

  it("returns the matched country when the current phone country is affected", () => {
    expect(matchedCohortCountry(args({ phoneCountry: "DE" }))).toBe("DE")
  })

  it("matches a deleted-phone country when the current phone is non-EU", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "US", deletedPhoneCountries: ["FR"] })),
    ).toBe("FR")
  })

  it("matches the creation-IP country when no phone signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "US", creationIpCountry: "FR" })),
    ).toBe("FR")
  })

  it("matches the creation-IP country when the account has no phone at all", () => {
    expect(matchedCohortCountry(args({ creationIpCountry: "IS" }))).toBe("IS")
  })

  it("prefers the phone country over deleted-phone and creation-IP signals", () => {
    expect(
      matchedCohortCountry(
        args({
          phoneCountry: "FR",
          deletedPhoneCountries: ["DE"],
          creationIpCountry: "IS",
        }),
      ),
    ).toBe("FR")
  })

  it("matches case-insensitively", () => {
    expect(matchedCohortCountry(args({ phoneCountry: "fr" }))).toBe("FR")
  })
})
