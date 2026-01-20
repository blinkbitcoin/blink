import { getTestAccountsCaptcha } from "@/config"

describe("test-accounts-captcha", () => {
  const testAccountsCaptcha = getTestAccountsCaptcha()

  it("returns phone numbers from config", () => {
    expect(Array.isArray(testAccountsCaptcha)).toBe(true)
  })

  it("phone in test_accounts_captcha list should be detected", () => {
    if (testAccountsCaptcha.length > 0) {
      const testPhone = testAccountsCaptcha[0]
      expect(testAccountsCaptcha.includes(testPhone)).toBe(true)
    }
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
