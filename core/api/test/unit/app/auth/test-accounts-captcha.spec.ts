import { getTestAccountsCaptcha } from "@/config"

describe("test-accounts-captcha", () => {
  const testAccountsCaptcha = getTestAccountsCaptcha()

  it("returns an array from config", () => {
    expect(Array.isArray(testAccountsCaptcha)).toBe(true)
  })

  it("phone not in test_accounts_captcha list should not be detected", () => {
    const nonTestPhone = "+19999999999" as PhoneNumber
    expect(testAccountsCaptcha.includes(nonTestPhone)).toBe(false)
  })

  it("empty phone should not match", () => {
    const emptyPhone = "" as PhoneNumber
    expect(testAccountsCaptcha.includes(emptyPhone)).toBe(false)
  })
})
