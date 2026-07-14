import { regionForCountry } from "@/domain/wind-down"

const euRegion: WindDownRegionConfig = {
  code: "eu",
  timezone: "Europe/Berlin",
  countries: ["FR", "DE"],
  receiveDisabledAt: "2026-08-15T00:00:00+02:00",
  finalDeadline: "2026-09-15T23:59:59+02:00",
  gateArmsAt: "2026-09-16T00:00:00+02:00",
  receiveDisabled: false,
  gateClosed: false,
}

const defaultRegion: WindDownRegionConfig = {
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: "2026-08-01T00:00:00+02:00",
  finalDeadline: "2026-08-31T23:59:59+02:00",
  gateArmsAt: "2026-09-01T00:00:00+02:00",
  receiveDisabled: false,
  gateClosed: false,
}

const regions = [euRegion, defaultRegion]

describe("regionForCountry", () => {
  it("picks the region whose countries list contains the matched country", () => {
    expect(regionForCountry("FR", regions)).toBe(euRegion)
  })

  it("matches the countries list case-insensitively", () => {
    expect(regionForCountry("de", regions)).toBe(euRegion)
  })

  it("falls back to the default region when no countries list contains it", () => {
    expect(regionForCountry("IS", regions)).toBe(defaultRegion)
  })

  it("falls back to the default region when the matched country is undefined", () => {
    expect(regionForCountry(undefined, regions)).toBe(defaultRegion)
  })

  it("returns undefined when nothing matches and there is no default region", () => {
    expect(regionForCountry("IS", [euRegion])).toBeUndefined()
  })
})
