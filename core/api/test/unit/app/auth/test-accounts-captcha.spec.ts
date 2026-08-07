import { getTestAccountsCaptcha } from "@/config/yaml"

describe("getTestAccountsCaptcha", () => {
  it("returns phone numbers from config", () => {
    const config = {
      test_accounts_captcha: [{ phone: "+16505551234" }, { phone: "+16505555678" }],
    } as unknown as YamlSchema

    const result = getTestAccountsCaptcha(config)

    expect(result).toEqual([{ phone: "+16505551234" }, { phone: "+16505555678" }])
    expect(result).toHaveLength(2)
  })

  it("returns empty array when config has no test accounts", () => {
    const config = {
      test_accounts_captcha: [],
    } as unknown as YamlSchema

    const result = getTestAccountsCaptcha(config)

    expect(result).toEqual([])
    expect(result).toHaveLength(0)
  })

  it("returns single phone number from config", () => {
    const config = {
      test_accounts_captcha: [{ phone: "+16505551111" }],
    } as unknown as YamlSchema

    const result = getTestAccountsCaptcha(config)

    expect(result).toEqual([{ phone: "+16505551111" }])
    expect(result).toHaveLength(1)
  })
})
