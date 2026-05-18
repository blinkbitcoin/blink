import { resetPhoneRateLimit } from "@/app/admin/reset-phone-rate-limit"
import { RateLimitConfig } from "@/domain/rate-limit"
import { resetLimiter } from "@/services/rate-limit"

jest.mock("@/domain/rate-limit", () => ({
  RateLimitConfig: {
    requestCodeAttemptPerPhoneNumber: {
      key: "request_phone_number_id",
      limits: { points: 5, duration: 60 },
    },
    loginAttemptPerLoginIdentifier: {
      key: "login_attempt_id",
      limits: { points: 5, duration: 60 },
    },
  },
}))

jest.mock("@/services/rate-limit", () => ({
  resetLimiter: jest.fn(),
}))

describe("resetPhoneRateLimit", () => {
  const mockResetLimiter = jest.mocked(resetLimiter)
  const phone = "+14155550123" as PhoneNumber

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("resets phone auth rate limits", async () => {
    mockResetLimiter.mockResolvedValue(true)

    const result = await resetPhoneRateLimit(phone)

    expect(result).toBe(true)
    expect(mockResetLimiter).toHaveBeenCalledTimes(2)
    expect(mockResetLimiter).toHaveBeenNthCalledWith(1, {
      rateLimitConfig: RateLimitConfig.requestCodeAttemptPerPhoneNumber,
      keyToConsume: phone,
    })
    expect(mockResetLimiter).toHaveBeenNthCalledWith(2, {
      rateLimitConfig: RateLimitConfig.loginAttemptPerLoginIdentifier,
      keyToConsume: phone,
    })
  })

  it("handles resetLimiter errors", async () => {
    const error = new Error("Reset failed")
    mockResetLimiter.mockResolvedValue(error)

    const result = await resetPhoneRateLimit(phone)

    expect(result).toBe(error)
  })
})
