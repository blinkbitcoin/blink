import { regionForCountry } from "@/domain/wind-down"

const northRegion: WindDownRegionConfig = {
  code: "north",
  timezone: "America/Mexico_City",
  countries: ["MX", "ar"],
  receiveDisabledAt: new Date("2026-08-15T00:00:00+02:00"),
  finalDeadline: new Date("2026-09-15T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-16T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
}

const defaultRegion: WindDownRegionConfig = {
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
}

const regions = [northRegion, defaultRegion]

const cohortCountry = (country: string) => country as CohortCountry

describe("regionForCountry", () => {
  it("picks the region whose countries list contains the matched country", () => {
    expect(regionForCountry(cohortCountry("MX"), regions)).toBe(northRegion)
  })

  it("matches lowercase countries-list entries case-insensitively", () => {
    expect(regionForCountry(cohortCountry("AR"), regions)).toBe(northRegion)
  })

  it("falls back to the default region when no countries list contains it", () => {
    expect(regionForCountry(cohortCountry("PE"), regions)).toBe(defaultRegion)
  })

  it("falls back to the default region when the matched country is undefined", () => {
    expect(regionForCountry(undefined, regions)).toBe(defaultRegion)
  })

  it("returns undefined when nothing matches and there is no default region", () => {
    expect(regionForCountry(cohortCountry("PE"), [northRegion])).toBeUndefined()
  })
})
