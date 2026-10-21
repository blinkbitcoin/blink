import fs from "fs"
import os from "os"
import path from "path"

import * as yaml from "js-yaml"

describe("LND_MAX_PAYMENT_PATHS", () => {
  const originalValue = process.env.LND_MAX_PAYMENT_PATHS
  const originalArgv = process.argv[2]
  let configDir: string

  beforeEach(() => {
    delete process.env.LND_MAX_PAYMENT_PATHS
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "lnd-payment-paths-"))
    process.argv[2] = path.join(configDir, "custom.yaml")
    fs.writeFileSync(process.argv[2], "{}\n")
  })

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.LND_MAX_PAYMENT_PATHS
    } else {
      process.env.LND_MAX_PAYMENT_PATHS = originalValue
    }
    if (originalArgv === undefined) {
      process.argv.splice(2, 1)
    } else {
      process.argv[2] = originalArgv
    }
    fs.rmSync(configDir, { recursive: true, force: true })
  })

  const setYamlMaxPaths = (maxPaths: unknown) => {
    fs.writeFileSync(
      process.argv[2],
      yaml.dump({ paymentNetworks: { lightning: { send: { maxPaths } } } }),
    )
  }

  it.each([1, 4, 16])("honors the YAML setting %i", (maxPaths) => {
    setYamlMaxPaths(maxPaths)
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(maxPaths)
    })
  })

  it.each([0, -1, 2.5, 17, "4", "invalid", Infinity, false, null])(
    "rejects the invalid YAML setting %s",
    (maxPaths) => {
      setYamlMaxPaths(maxPaths)
      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { LND_MAX_PAYMENT_PATHS } = require("@/config")
          return LND_MAX_PAYMENT_PATHS
        })
      }).toThrow("Invalid yaml configuration")
    },
  )

  it("lets the environment override YAML to disable MPP", () => {
    setYamlMaxPaths(4)
    process.env.LND_MAX_PAYMENT_PATHS = "1"
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(1)
    })
  })

  it.each([
    ["1", 1],
    ["4", 4],
    ["16", 16],
  ])("honors the explicit setting %s", (value, expected) => {
    process.env.LND_MAX_PAYMENT_PATHS = value

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(expected)
    })
  })

  it.each(["0", "-1", "invalid", "2.5", "Infinity", "4294967296", "17"])(
    "rejects the invalid setting %s",
    (value) => {
      process.env.LND_MAX_PAYMENT_PATHS = value

      expect(() => {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { LND_MAX_PAYMENT_PATHS } = require("@/config")
          return LND_MAX_PAYMENT_PATHS
        })
      }).toThrow("Invalid environment variables")
    },
  )

  it("defaults to single-path payments when unset", () => {
    delete process.env.LND_MAX_PAYMENT_PATHS

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(1)
    })
  })
})
