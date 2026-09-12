const managedEnv = [
  "INVESTMENT_AGREEMENT_ENABLED",
  "ESIGN_PROVIDER",
  "DOCUSIGN_RETURN_URL",
] as const

const returnUrl = "https://api.blink.sv/signing/return"

const loadConfig = (): Promise<typeof import("@/config")> =>
  new Promise((resolve, reject) => {
    jest
      .isolateModulesAsync(async () => {
        resolve(await import("@/config"))
      })
      .catch(reject)
  })

describe("getESignConfig", () => {
  afterEach(() => {
    managedEnv.forEach((key) => delete process.env[key])
    jest.restoreAllMocks()
  })

  it("leaves the e-signature config unresolved while investment agreements are disabled", async () => {
    const config = await loadConfig()
    expect(config.INVESTMENT_AGREEMENT_ENABLED).toBe(false)
    expect(config.getESignConfig()).toBeUndefined()
  })

  it("resolves the e-signature config at startup when investment agreements are enabled", async () => {
    Object.assign(process.env, {
      INVESTMENT_AGREEMENT_ENABLED: "true",
      ESIGN_PROVIDER: "mock",
      DOCUSIGN_RETURN_URL: returnUrl,
    })

    const config = await loadConfig()
    expect(config.INVESTMENT_AGREEMENT_ENABLED).toBe(true)
    expect(config.getESignConfig()).toEqual({ provider: "mock", returnUrl })
  })

  it("prevents startup when investment agreements are enabled without e-signature config", async () => {
    process.env.INVESTMENT_AGREEMENT_ENABLED = "true"

    await expect(loadConfig()).rejects.toThrow("Missing ESIGN_PROVIDER config")
  })

  it("prevents startup with a flag value other than true or false", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined)
    process.env.INVESTMENT_AGREEMENT_ENABLED = "yes"

    await expect(loadConfig()).rejects.toThrow("Invalid environment variables")
  })
})
