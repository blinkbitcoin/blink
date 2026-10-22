import fs from "fs"
import path from "path"

const dummyEnv: Record<string, string> = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../../../dev/core-bundle/dummy-env.json"),
    "utf8",
  ),
)

const loadFlag = (): boolean => {
  let flag = false
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    flag = require("@/config/env").env.UNSECURE_CALLBACK_ENDPOINT_URLS
  })
  return flag
}

describe("UNSECURE_CALLBACK_ENDPOINT_URLS", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...dummyEnv, ...originalEnv }
    delete process.env.UNSECURE_CALLBACK_ENDPOINT_URLS
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("defaults to false when unset", () => {
    expect(loadFlag()).toBe(false)
  })

  it.each([
    ["false", false],
    ["true", true],
  ])("parses %s", (value, expected) => {
    process.env.UNSECURE_CALLBACK_ENDPOINT_URLS = value
    expect(loadFlag()).toBe(expected)
  })

  it.each(["", "1", "yes", "TRUE"])("rejects %p", (value) => {
    process.env.UNSECURE_CALLBACK_ENDPOINT_URLS = value
    expect(loadFlag).toThrow("Invalid environment variables")
  })
})
