import {
  getRequestCodeCaptchaGlobalLimits,
  getRequestCodeCaptchaPerCountryLimits,
} from "@/config"
import { RateLimitConfig, RateLimitPrefix } from "@/domain/rate-limit"
import {
  CaptchaRequestCodeGlobalRateLimiterExceededError,
  CaptchaRequestCodePerCountryRateLimiterExceededError,
} from "@/domain/rate-limit/errors"

describe("RateLimitConfig - captcha request code caps", () => {
  it("wires the per-country cap to its own prefix, limits and error", () => {
    const config = RateLimitConfig.requestCodeCaptchaPerCountry

    expect(config.key).toBe(RateLimitPrefix.requestCodeCaptchaPerCountry)
    expect(config.key).toBe("request_code_captcha_country")
    expect(config.limits).toEqual(getRequestCodeCaptchaPerCountryLimits())
    expect(config.error).toBe(CaptchaRequestCodePerCountryRateLimiterExceededError)
  })

  it("wires the global cap to its own prefix, limits and error", () => {
    const config = RateLimitConfig.requestCodeCaptchaGlobal

    expect(config.key).toBe(RateLimitPrefix.requestCodeCaptchaGlobal)
    expect(config.key).toBe("request_code_captcha_global")
    expect(config.limits).toEqual(getRequestCodeCaptchaGlobalLimits())
    expect(config.error).toBe(CaptchaRequestCodeGlobalRateLimiterExceededError)
  })
})
