import { resetLimiter } from "@/services/rate-limit"
import { RateLimitConfig } from "@/domain/rate-limit"
import { addAttributesToCurrentSpan } from "@/services/tracing"

export const resetPhoneRateLimit = async (
  phone: PhoneNumber,
): Promise<boolean | ApplicationError> => {
  addAttributesToCurrentSpan({ "rateLimit.phone": phone })

  const phoneRateLimits = [
    RateLimitConfig.requestCodeAttemptPerPhoneNumber,
    RateLimitConfig.loginAttemptPerLoginIdentifier,
  ]

  for (const rateLimitConfig of phoneRateLimits) {
    const result = await resetLimiter({
      rateLimitConfig,
      keyToConsume: phone,
    })

    if (result instanceof Error) return result
  }

  return true
}
