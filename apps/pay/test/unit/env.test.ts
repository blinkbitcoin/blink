// Trailing-slash normalization for URL-typed env vars: values are interpolated
// as `${BASE}/${path}`, so a configured trailing slash would produce "//".

// This app's tsconfig program includes Cypress (Chai) types, whose global
// `expect` shadows jest's — re-alias it to jest's Expect type for this file.
const expect = globalThis.expect as unknown as jest.Expect

export {}

describe("env URL trailing-slash normalization", () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it("strips trailing slashes from configured values", () => {
    process.env.WELL_KNOWN_LNURL_URL = "https://blink.sv/"
    process.env.BLINK_TERMINAL_URL = "https://terminal.blinkbtc.com///"
    const { env } = jest.requireActual("@/env") as typeof import("@/env")
    expect(env.WELL_KNOWN_LNURL_URL).toBe("https://blink.sv")
    expect(env.BLINK_TERMINAL_URL).toBe("https://terminal.blinkbtc.com")
  })

  it("keeps the production defaults when unset", () => {
    delete process.env.WELL_KNOWN_LNURL_URL
    delete process.env.BLINK_TERMINAL_URL
    const { env } = jest.requireActual("@/env") as typeof import("@/env")
    expect(env.WELL_KNOWN_LNURL_URL).toBe("https://blink.sv")
    expect(env.BLINK_TERMINAL_URL).toBe("https://terminal.blinkbtc.com")
  })
})
