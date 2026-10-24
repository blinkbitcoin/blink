import { getAnonPhoneLookupGlobalLimits } from "@/config"
import { RateLimitConfig, RateLimitPrefix } from "@/domain/rate-limit"
import { AnonPhoneLookupGlobalRateLimiterExceededError } from "@/domain/rate-limit/errors"

describe("RateLimitConfig - anonymous phone lookup global cap", () => {
  it("wires the global cap to its own prefix, limits and error", () => {
    const config = RateLimitConfig.anonPhoneLookupGlobal

    expect(config.key).toBe(RateLimitPrefix.anonPhoneLookupGlobal)
    expect(config.key).toBe("anon_phone_lookup_global")
    expect(config.limits).toEqual(getAnonPhoneLookupGlobalLimits())
    expect(config.error).toBe(AnonPhoneLookupGlobalRateLimiterExceededError)
  })
})
