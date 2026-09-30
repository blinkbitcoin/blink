describe("LND_MAX_PAYMENT_PATHS", () => {
  const originalValue = process.env.LND_MAX_PAYMENT_PATHS

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.LND_MAX_PAYMENT_PATHS
    } else {
      process.env.LND_MAX_PAYMENT_PATHS = originalValue
    }
  })

  it.each([
    ["1", 1],
    ["4", 4],
  ])("honors the explicit setting %s", (value, expected) => {
    process.env.LND_MAX_PAYMENT_PATHS = value

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(expected)
    })
  })

  it.each(["0", "-1", "invalid"])("rejects the invalid setting %s", (value) => {
    process.env.LND_MAX_PAYMENT_PATHS = value

    expect(() => {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { LND_MAX_PAYMENT_PATHS } = require("@/config")
        return LND_MAX_PAYMENT_PATHS
      })
    }).toThrow("Invalid environment variables")
  })

  it("defaults to single-path payments when unset", () => {
    delete process.env.LND_MAX_PAYMENT_PATHS

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { LND_MAX_PAYMENT_PATHS } = require("@/config")
      expect(LND_MAX_PAYMENT_PATHS).toBe(1)
    })
  })
})
