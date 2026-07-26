import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({
  dir: "./",
})

const config: Config = {
  clearMocks: true,
  collectCoverage: true,

  coverageDirectory: "coverage",
  coverageProvider: "v8",

  // Imports with the "@/" alias are rewritten by SWC from tsconfig paths, but
  // jest.mock("@/...") specifiers are not — map them explicitly so mocks of
  // aliased modules resolve.
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
}

export default createJestConfig(config)
