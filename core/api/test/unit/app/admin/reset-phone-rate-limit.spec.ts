import { resetPhoneRateLimit } from "@/app/admin/reset-phone-rate-limit"
import { RateLimitConfig } from "@/domain/rate-limit"
import { baseLogger } from "@/services/logger"
import { resetLimiter } from "@/services/rate-limit"
import { addAttributesToCurrentSpan } from "@/services/tracing"

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

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: { info: jest.fn() },
}))

jest.mock("@/services/phone-hash", () => ({
  hashPhone: jest.fn(() => "phone-hash"),
}))

describe("resetPhoneRateLimit", () => {
  const mockResetLimiter = jest.mocked(resetLimiter)
  const mockAddAttributes = jest.mocked(addAttributesToCurrentSpan)
  const mockLoggerInfo = jest.mocked(baseLogger.info)
  const phone = "+14155550123" as PhoneNumber
  const resetByPrivilegedClientId = "support-client" as PrivilegedClientId

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("resets phone auth rate limits", async () => {
    mockResetLimiter.mockResolvedValue(true)

    const result = await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

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

  it("audits the privileged client and a hashed phone", async () => {
    mockResetLimiter.mockResolvedValue(true)

    await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      {
        resetByPrivilegedClientId,
        phoneHash: "phone-hash",
        success: true,
        resetLimiters: [
          "requestCodeAttemptPerPhoneNumber",
          "loginAttemptPerLoginIdentifier",
        ],
        failedLimiters: [],
      },
      "Phone auth rate limit reset",
    )
    expect(JSON.stringify(mockLoggerInfo.mock.calls)).not.toContain(phone)
  })

  it("mirrors the audit attributes onto the current span", async () => {
    mockResetLimiter.mockResolvedValue(true)

    await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

    expect(mockAddAttributes).toHaveBeenCalledWith({
      "phoneHash": "phone-hash",
      "phoneRateLimitReset.success": true,
      "phoneRateLimitReset.resetLimiters":
        "requestCodeAttemptPerPhoneNumber,loginAttemptPerLoginIdentifier",
      "phoneRateLimitReset.failedLimiters": "",
    })
    expect(JSON.stringify(mockAddAttributes.mock.calls)).not.toContain(phone)
  })

  it("handles resetLimiter errors", async () => {
    const error = new Error("Reset failed")
    mockResetLimiter.mockResolvedValue(error)

    const result = await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

    expect(result).toBe(error)
  })

  it("attempts every limiter even when an earlier one fails", async () => {
    const error = new Error("Reset failed")
    mockResetLimiter.mockResolvedValueOnce(error).mockResolvedValueOnce(true)

    const result = await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

    expect(mockResetLimiter).toHaveBeenCalledTimes(2)
    expect(result).toBe(error)
  })

  it("records which limiters were reset on a partial failure", async () => {
    mockResetLimiter.mockResolvedValueOnce(new Error("Reset failed"))
    mockResetLimiter.mockResolvedValueOnce(true)

    await resetPhoneRateLimit({ phone, resetByPrivilegedClientId })

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resetByPrivilegedClientId,
        phoneHash: "phone-hash",
        success: false,
        resetLimiters: ["loginAttemptPerLoginIdentifier"],
        failedLimiters: ["requestCodeAttemptPerPhoneNumber"],
      }),
      "Phone auth rate limit reset",
    )
  })
})
