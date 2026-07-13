import Ajv from "ajv"

import { configSchema, registerConfigFormats, yamlConfig } from "@/config"

const ajv = registerConfigFormats(
  new Ajv({ useDefaults: true, discriminator: true, $data: true }),
)
const validate = ajv.compile(configSchema)

const cloneConfig = () => JSON.parse(JSON.stringify(yamlConfig))

describe("windDown region flags", () => {
  it("accepts the shipped-dark default config", () => {
    expect(validate(cloneConfig())).toBe(true)
  })

  it("accepts receiveDisabled.enabled true — sequencing is an operational gate, not a config invariant", () => {
    const config = cloneConfig()
    config.windDown.regions[0].receiveDisabled = { enabled: true }
    expect(validate(config)).toBe(true)
  })

  it("rejects an unknown key on receiveDisabled", () => {
    const config = cloneConfig()
    config.windDown.regions[0].receiveDisabled = {
      enabled: true,
      flowVerifiedLiveAt: "2026-07-25T00:00:00+02:00",
    }
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
