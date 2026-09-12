import fs from "fs"
import os from "os"
import path from "path"

import Ajv from "ajv"
import addFormats from "ajv-formats"
import * as yaml from "js-yaml"

import { configSchema, getInvestmentAgreementConfig, yamlConfig } from "@/config"

const ajv = addFormats(new Ajv({ useDefaults: true, discriminator: true, $data: true }))
const validate = ajv.compile(configSchema)

const cloneConfig = () => JSON.parse(JSON.stringify(yamlConfig))

const loadYamlWithCustomConfig = (customConfig: unknown): Promise<unknown> => {
  const customPath = path.join(os.tmpdir(), `investment-agreement-${process.pid}.yaml`)
  fs.writeFileSync(customPath, yaml.dump(customConfig))
  const originalArgv = process.argv[2]
  process.argv[2] = customPath

  return new Promise((resolve, reject) => {
    jest
      .isolateModulesAsync(async () => {
        resolve(await import("@/config/yaml"))
      })
      .catch(reject)
  }).finally(() => {
    process.argv[2] = originalArgv
    fs.unlinkSync(customPath)
  })
}

describe("investmentAgreement config", () => {
  it("loads the provisional contract rules and TEST placeholder values by default", () => {
    expect(getInvestmentAgreementConfig()).toEqual({
      pricePerUnitUsdCents: 100,
      preMoneyValuationUsdCents: 1_000_000_000,
      minUnits: 1,
      maxUnits: 100_000,
      signingReuseWindowMinutes: 15,
      paymentWindowHours: 24,
      rateTimeZone: "America/Tegucigalpa",
      placeholderValues: {
        fullLegalName: "TEST Investor Name",
        countryOfResidence: "TEST Country",
        subMembershipTier: "TEST Tier",
        subMembershipTerm: "TEST Term",
      },
    })
  })

  it("rejects maxUnits below minUnits", () => {
    const config = cloneConfig()
    config.investmentAgreement.minUnits = 10
    config.investmentAgreement.maxUnits = 9
    expect(validate(config)).toBe(false)
  })

  it.each(["signingReuseWindowMinutes", "paymentWindowHours"])(
    "rejects a %s below one",
    (window) => {
      const config = cloneConfig()
      config.investmentAgreement[window] = 0
      expect(validate(config)).toBe(false)
    },
  )

  it.each(["signingReuseWindowMinutes", "paymentWindowHours"])(
    "rejects a fractional %s",
    (window) => {
      const config = cloneConfig()
      config.investmentAgreement[window] = 1.5
      expect(validate(config)).toBe(false)
    },
  )

  it("rejects an empty placeholder value", () => {
    const config = cloneConfig()
    config.investmentAgreement.placeholderValues.fullLegalName = ""
    expect(validate(config)).toBe(false)
  })

  it("prevents startup with an invalid rate time zone", async () => {
    await expect(
      loadYamlWithCustomConfig({
        investmentAgreement: { rateTimeZone: "Mars/Olympus_Mons" },
      }),
    ).rejects.toThrow("Invalid investmentAgreement rateTimeZone")
  })
})
