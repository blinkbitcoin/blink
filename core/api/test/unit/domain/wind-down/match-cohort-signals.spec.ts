import { matchedCohortCountry } from "@/domain/wind-down"

const args = (
  overrides: Partial<MatchCohortSignalsArgs> = {},
): MatchCohortSignalsArgs => ({
  phoneCountry: undefined,
  deletedPhoneCountries: [],
  creationIpCountry: undefined,
  affectedCountries: ["MX", "AR", "PE"],
  ...overrides,
})

describe("matchedCohortCountry", () => {
  it("returns undefined when no signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "GT", creationIpCountry: "TH" })),
    ).toBeUndefined()
  })

  it("returns the matched country when the current phone country is affected", () => {
    expect(matchedCohortCountry(args({ phoneCountry: "AR" }))).toBe("AR")
  })

  it("matches a deleted-phone country when the current phone is unaffected", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "GT", deletedPhoneCountries: ["MX"] })),
    ).toBe("MX")
  })

  it("matches the creation-IP country when no phone signal matches", () => {
    expect(
      matchedCohortCountry(args({ phoneCountry: "GT", creationIpCountry: "MX" })),
    ).toBe("MX")
  })

  it("matches the creation-IP country when the account has no phone at all", () => {
    expect(matchedCohortCountry(args({ creationIpCountry: "PE" }))).toBe("PE")
  })

  it("prefers the phone country over deleted-phone and creation-IP signals", () => {
    expect(
      matchedCohortCountry(
        args({
          phoneCountry: "MX",
          deletedPhoneCountries: ["AR"],
          creationIpCountry: "PE",
        }),
      ),
    ).toBe("MX")
  })

  it("matches case-insensitively", () => {
    expect(matchedCohortCountry(args({ phoneCountry: "mx" }))).toBe("MX")
  })
})
