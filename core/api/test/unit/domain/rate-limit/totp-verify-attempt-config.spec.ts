import { getTotpVerifyAttemptPerUserLimits } from "@/config"
import { RateLimitConfig, RateLimitPrefix } from "@/domain/rate-limit"
import { TotpVerifyAttemptPerUserRateLimiterExceededError } from "@/domain/rate-limit/errors"

describe("RateLimitConfig - totp verify attempts per user", () => {
  it("wires the per-user cap to its own prefix, limits and error", () => {
    const config = RateLimitConfig.totpVerifyAttemptPerUser

    expect(config.key).toBe(RateLimitPrefix.totpVerifyAttemptPerUser)
    expect(config.key).toBe("totp_verify_attempt_user")
    expect(config.limits).toEqual(getTotpVerifyAttemptPerUserLimits())
    expect(config.error).toBe(TotpVerifyAttemptPerUserRateLimiterExceededError)
  })
})
