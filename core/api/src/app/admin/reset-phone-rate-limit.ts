import { RateLimitConfig } from "@/domain/rate-limit"

import { baseLogger } from "@/services/logger"
import { hashPhone } from "@/services/phone-hash"
import { resetLimiter } from "@/services/rate-limit"
import { addAttributesToCurrentSpan } from "@/services/tracing"

const phoneAuthRateLimits = {
  requestCodeAttemptPerPhoneNumber: RateLimitConfig.requestCodeAttemptPerPhoneNumber,
  loginAttemptPerLoginIdentifier: RateLimitConfig.loginAttemptPerLoginIdentifier,
}

export const resetPhoneRateLimit = async ({
  phone,
  resetByPrivilegedClientId,
}: {
  phone: PhoneNumber
  resetByPrivilegedClientId: PrivilegedClientId
}): Promise<boolean | ApplicationError> => {
  const resetLimiters: string[] = []
  const failedLimiters: string[] = []
  let firstError: ApplicationError | undefined

  // Every limiter is attempted even if an earlier one fails: the point of the mutation
  // is to unblock the user, so clearing what we can is better than stopping at the
  // first error. The audit record below says exactly which ones were cleared.
  for (const [name, rateLimitConfig] of Object.entries(phoneAuthRateLimits)) {
    const result = await resetLimiter({ rateLimitConfig, keyToConsume: phone })
    if (result instanceof Error) {
      failedLimiters.push(name)
      if (firstError === undefined) firstError = result
      continue
    }
    resetLimiters.push(name)
  }

  const phoneHash = hashPhone(phone)
  const success = failedLimiters.length === 0

  addAttributesToCurrentSpan({
    phoneHash,
    "phoneRateLimitReset.success": success,
    "phoneRateLimitReset.resetLimiters": resetLimiters.join(","),
    "phoneRateLimitReset.failedLimiters": failedLimiters.join(","),
  })

  baseLogger.info(
    { resetByPrivilegedClientId, phoneHash, success, resetLimiters, failedLimiters },
    "Phone auth rate limit reset",
  )

  if (firstError !== undefined) return firstError

  return true
}
