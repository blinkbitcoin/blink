import { resolveWindDownRegion } from "@/domain/wind-down"

const euRegion: WindDownRegionConfig = {
  code: "eu",
  timezone: "Europe/Berlin",
  countries: ["FR", "de"],
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

const levelZeroRegion: WindDownRegionConfig = {
  code: "level-zero",
  timezone: "Europe/Paris",
  countries: [],
  receiveDisabledAt: new Date("2026-10-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-10-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-11-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
}

const regions = [euRegion, defaultRegion]
const regionsWithLevelZero = [euRegion, levelZeroRegion, defaultRegion]

const cohortCountry = (country: string) => country as CohortCountry
const level = (value: number) => value as AccountLevel

describe("resolveWindDownRegion", () => {
  it("picks the region whose countries list contains the matched country", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("FR"),
        level: level(1),
        regions,
      }),
    ).toBe(euRegion)
  })

  it("matches lowercase countries-list entries case-insensitively", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("DE"),
        level: level(1),
        regions,
      }),
    ).toBe(euRegion)
  })

  it("falls back to the default region when no countries list contains it", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("IS"),
        level: level(1),
        regions,
      }),
    ).toBe(defaultRegion)
  })

  it("never routes a country match to the level-zero region, even for a Level 0 account", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("IS"),
        level: level(0),
        regions: regionsWithLevelZero,
      }),
    ).toBe(defaultRegion)
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("FR"),
        level: level(0),
        regions: regionsWithLevelZero,
      }),
    ).toBe(euRegion)
  })

  it("ignores a countries list on the level-zero region", () => {
    const misconfiguredLevelZero = { ...levelZeroRegion, countries: ["IS"] }
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("IS"),
        level: level(1),
        regions: [euRegion, misconfiguredLevelZero, defaultRegion],
      }),
    ).toBe(defaultRegion)
  })

  it("routes an unmatched Level 0 account to the level-zero region when configured", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: undefined,
        level: level(0),
        regions: regionsWithLevelZero,
      }),
    ).toBe(levelZeroRegion)
  })

  it("routes an unmatched Level 0 account to the default region when no level-zero region exists", () => {
    expect(
      resolveWindDownRegion({ matchedCountry: undefined, level: level(0), regions }),
    ).toBe(defaultRegion)
  })

  it("routes an unmatched non-Level-0 account to the default region even when a level-zero region exists", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: undefined,
        level: level(1),
        regions: regionsWithLevelZero,
      }),
    ).toBe(defaultRegion)
  })

  it("treats a missing level as not Level 0", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: undefined,
        level: undefined,
        regions: regionsWithLevelZero,
      }),
    ).toBe(defaultRegion)
  })

  it("returns undefined when nothing matches and there is no default region", () => {
    expect(
      resolveWindDownRegion({
        matchedCountry: cohortCountry("IS"),
        level: level(1),
        regions: [euRegion],
      }),
    ).toBeUndefined()
    expect(
      resolveWindDownRegion({
        matchedCountry: undefined,
        level: level(0),
        regions: [euRegion],
      }),
    ).toBeUndefined()
  })
})
