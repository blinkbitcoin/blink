import { resetPhoneRateLimit } from "@/app/admin/reset-phone-rate-limit"
import { RateLimitConfig } from "@/domain/rate-limit"
import { RedisRateLimitService, resetLimiter } from "@/services/rate-limit"

describe("resetPhoneRateLimit integration", () => {
  const phone = "+14155550123" as PhoneNumber
  const rateLimitConfig = RateLimitConfig.loginAttemptPerLoginIdentifier

  beforeEach(async () => {
    await resetLimiter({
      rateLimitConfig,
      keyToConsume: phone,
    })
  })

  it("resets phone login attempt rate limit in Redis", async () => {
    const rateLimit = RedisRateLimitService({
      keyPrefix: rateLimitConfig.key,
      limitOptions: rateLimitConfig.limits,
    })

    // Consume all available points
    for (let i = 0; i < rateLimitConfig.limits.points; i++) {
      await rateLimit.consume(phone)
    }

    // Verify rate limit is exceeded
    const exceededResult = await rateLimit.consume(phone)
    expect(exceededResult).toBeInstanceOf(Error)

    // Reset the rate limit
    const resetResult = await resetPhoneRateLimit(phone)
    expect(resetResult).toBe(true)

    // Verify rate limit is reset
    const afterResetResult = await rateLimit.consume(phone)
    expect(afterResetResult).not.toBeInstanceOf(Error)
  })
})
