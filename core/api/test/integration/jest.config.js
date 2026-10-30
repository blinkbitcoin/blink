const path = require("path")

const swcConfig = require("../swc-config.json")

module.exports = {
  // Shared-state suites stay serial, but the worker can recycle between files.
  // --runInBand disables recycling; keep it off both integration entry points.
  maxWorkers: 1,
  workerIdleMemoryLimit: "512MB",
  moduleFileExtensions: ["js", "json", "ts", "cjs", "mjs"],
  rootDir: "../../",
  roots: ["<rootDir>/test/integration"],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", swcConfig],
  },
  testRegex: ".*\\.spec\\.ts$",
  // Progress on stdout survives a buck2 timeout, which drops Jest's results.
  // Resolved from this file, not <rootDir>, so a config reused with another
  // rootDir (ci/tests/integration-worker-recycling.spec.cjs) still finds it.
  reporters: ["default", path.join(__dirname, "progress-reporter.js")],
  setupFilesAfterEnv: ["<rootDir>/test/integration/jest.setup.js"],
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": ["<rootDir>/src/$1"],
    "^test/(.*)$": ["<rootDir>/test/$1"],
  },
}
