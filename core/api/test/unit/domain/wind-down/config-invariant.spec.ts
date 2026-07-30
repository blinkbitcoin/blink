import Ajv from "ajv"
import addFormats from "ajv-formats"

import { configSchema, yamlConfig } from "@/config"

const ajv = addFormats(new Ajv({ useDefaults: true, discriminator: true, $data: true }))
const validate = ajv.compile(configSchema)

const cloneConfig = () => JSON.parse(JSON.stringify(yamlConfig))

describe("windDown region flags", () => {
  it("accepts the shipped-dark default config", () => {
    expect(validate(cloneConfig())).toBe(true)
  })

  it("accepts receiveDisabled true — sequencing is an operational gate, not a config invariant", () => {
    const config = cloneConfig()
    config.windDown.regions[0].receiveDisabled = true
    expect(validate(config)).toBe(true)
  })

  it("rejects the legacy nested {enabled} shape", () => {
    const config = cloneConfig()
    config.windDown.regions[0].receiveDisabled = { enabled: true }
    expect(validate(config)).toBe(false)
  })
})

describe("windDown includeLevelZero backfill invariant", () => {
  it("accepts a config that predates the key and backfills false", () => {
    const config = cloneConfig()
    delete config.windDown.includeLevelZero
    expect(validate(config)).toBe(true)
    expect(config.windDown.includeLevelZero).toBe(false)
  })

  it("keeps an explicit true — the default never overwrites a set value", () => {
    const config = cloneConfig()
    config.windDown.includeLevelZero = true
    expect(validate(config)).toBe(true)
    expect(config.windDown.includeLevelZero).toBe(true)
  })
})

describe("windDown cohort flag invariants", () => {
  it("backfills usePersistedCohortFlag false for a config that predates the key", () => {
    const config = cloneConfig()
    delete config.windDown.usePersistedCohortFlag
    expect(validate(config)).toBe(true)
    expect(config.windDown.usePersistedCohortFlag).toBe(false)
  })

  it("keeps an explicit usePersistedCohortFlag true when the strict list is populated", () => {
    const config = cloneConfig()
    config.windDown.usePersistedCohortFlag = true
    config.windDown.strictCountries = ["KE", "FJ"]
    expect(validate(config)).toBe(true)
    expect(config.windDown.usePersistedCohortFlag).toBe(true)
  })

  it("rejects the flag on with an empty strictCountries list — refuses to boot", () => {
    const config = cloneConfig()
    config.windDown.usePersistedCohortFlag = true
    config.windDown.strictCountries = []
    expect(validate(config)).toBe(false)
  })

  it("rejects the flag on with an empty affectedCountries list — the legacy kill-switch instinct must not persist mass releases", () => {
    const config = cloneConfig()
    config.windDown.usePersistedCohortFlag = true
    config.windDown.strictCountries = ["KE", "FJ"]
    config.windDown.affectedCountries = []
    expect(validate(config)).toBe(false)
  })

  it("accepts an empty affectedCountries list while the flag is off", () => {
    const config = cloneConfig()
    config.windDown.usePersistedCohortFlag = false
    config.windDown.affectedCountries = []
    expect(validate(config)).toBe(true)
  })

  it("accepts an empty strictCountries list while the flag is off", () => {
    const config = cloneConfig()
    config.windDown.usePersistedCohortFlag = false
    config.windDown.strictCountries = []
    expect(validate(config)).toBe(true)
  })

  it("backfills the agreed ipEvidenceCutoff default when unset", () => {
    const config = cloneConfig()
    delete config.windDown.ipEvidenceCutoff
    expect(validate(config)).toBe(true)
    expect(config.windDown.ipEvidenceCutoff).toBe("2026-07-30T23:59:59Z")
  })

  it("accepts a well-formed ipEvidenceCutoff", () => {
    const config = cloneConfig()
    config.windDown.ipEvidenceCutoff = "2026-07-01T00:00:00Z"
    expect(validate(config)).toBe(true)
  })

  it("rejects an ipEvidenceCutoff without a UTC offset", () => {
    const config = cloneConfig()
    config.windDown.ipEvidenceCutoff = "2026-07-01T00:00:00"
    expect(validate(config)).toBe(false)
  })

  it("rejects a malformed ipEvidenceCutoff", () => {
    const config = cloneConfig()
    config.windDown.ipEvidenceCutoff = "1 July 2026"
    expect(validate(config)).toBe(false)
  })
})

describe("windDown region resolution invariant", () => {
  it("rejects an empty regions list", () => {
    const config = cloneConfig()
    config.windDown.regions = []
    expect(validate(config)).toBe(false)
  })

  it("rejects a regions list with no default region", () => {
    const config = cloneConfig()
    config.windDown.regions[0].code = "eea"
    expect(validate(config)).toBe(false)
  })

  it("accepts a country-specific region alongside the default region", () => {
    const config = cloneConfig()
    config.windDown.regions.push({
      ...cloneConfig().windDown.regions[0],
      code: "iceland",
      countries: ["IS"],
      timezone: "Atlantic/Reykjavik",
    })
    expect(validate(config)).toBe(true)
  })

  it("rejects a region that omits receiveDisabledAt", () => {
    const config = cloneConfig()
    delete config.windDown.regions[0].receiveDisabledAt
    expect(validate(config)).toBe(false)
  })
})

describe("windDown date and country format invariants", () => {
  it("rejects an operative date without a UTC offset", () => {
    const config = cloneConfig()
    config.windDown.regions[0].gateArmsAt = "2026-09-01T00:00:00"
    expect(validate(config)).toBe(false)
  })

  it("accepts operative dates with a numeric offset or Z", () => {
    const config = cloneConfig()
    config.windDown.regions[0].gateArmsAt = "2026-08-31T22:00:00Z"
    expect(validate(config)).toBe(true)
  })

  it("rejects a malformed operative date", () => {
    const config = cloneConfig()
    config.windDown.regions[0].finalDeadline = "31 August 2026"
    expect(validate(config)).toBe(false)
  })

  it("rejects a shape-valid but calendar-invalid operative date", () => {
    const config = cloneConfig()
    config.windDown.regions[0].finalDeadline = "2026-13-45T00:00:00+02:00"
    expect(validate(config)).toBe(false)
  })

  it("rejects a nonexistent day of month", () => {
    const config = cloneConfig()
    config.windDown.regions[0].gateArmsAt = "2026-02-30T00:00:00+01:00"
    expect(validate(config)).toBe(false)
  })

  it("rejects a null receiveDisabledAt — a region is a schedule, all three dates are required", () => {
    const config = cloneConfig()
    config.windDown.regions[0].receiveDisabledAt = null
    expect(validate(config)).toBe(false)
  })

  it("rejects an affectedCountries entry that is not an alpha-2 code", () => {
    const config = cloneConfig()
    config.windDown.affectedCountries = ["FRA"]
    expect(validate(config)).toBe(false)
  })

  it("accepts alpha-2 affectedCountries entries", () => {
    const config = cloneConfig()
    config.windDown.affectedCountries = ["FR", "de", "IS"]
    expect(validate(config)).toBe(true)
  })
})

describe("windDown strictCountries invariants", () => {
  it("backfills an empty strictCountries list for a config that predates the key", () => {
    const config = cloneConfig()
    delete config.windDown.strictCountries
    expect(validate(config)).toBe(true)
    expect(config.windDown.strictCountries).toEqual([])
  })

  it("keeps an explicit strictCountries list — the default never overwrites a set value", () => {
    const config = cloneConfig()
    config.windDown.strictCountries = ["KE", "FJ"]
    expect(validate(config)).toBe(true)
    expect(config.windDown.strictCountries).toEqual(["KE", "FJ"])
  })

  it("accepts alpha-2 strictCountries entries", () => {
    const config = cloneConfig()
    config.windDown.strictCountries = ["KE", "fj"]
    expect(validate(config)).toBe(true)
  })

  it("rejects a strictCountries entry that is not an alpha-2 code", () => {
    const config = cloneConfig()
    config.windDown.strictCountries = ["KEN"]
    expect(validate(config)).toBe(false)
  })
})
