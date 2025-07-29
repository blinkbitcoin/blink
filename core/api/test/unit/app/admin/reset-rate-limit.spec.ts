import { resetRateLimit } from "@/app/admin/remove-redis-key"
import { RateLimitConfig } from "@/domain/rate-limit"
import { UnknownRepositoryError } from "@/domain/errors"
import * as RateLimitImpl from "@/services/rate-limit"

jest.mock("@/services/rate-limit")

describe("resetRateLimit", () => {
  const mockResetLimiter = jest.fn()
  
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(RateLimitImpl, "resetLimiter").mockImplementation(mockResetLimiter)
  })

  it("successfully resets rate limit for valid key", async () => {
    mockResetLimiter.mockResolvedValue(true)
    
    const result = await resetRateLimit("invoiceCreate:accountId123")
    
    expect(result).toBe(true)
    expect(mockResetLimiter).toHaveBeenCalledWith({
      rateLimitConfig: RateLimitConfig.invoiceCreate,
      keyToConsume: "accountId123",
    })
  })

  it("returns error for invalid key format", async () => {
    const result = await resetRateLimit("invalidkey")
    
    expect(result).toBeInstanceOf(UnknownRepositoryError)
    expect(mockResetLimiter).not.toHaveBeenCalled()
  })

  it("returns error for unknown rate limit prefix", async () => {
    const result = await resetRateLimit("unknownPrefix:key123")
    
    expect(result).toBeInstanceOf(UnknownRepositoryError)
    expect(mockResetLimiter).not.toHaveBeenCalled()
  })

  it("handles resetLimiter errors", async () => {
    const error = new Error("Reset failed")
    mockResetLimiter.mockResolvedValue(error)
    
    const result = await resetRateLimit("invoiceCreate:accountId123")
    
    expect(result).toBe(error)
  })
})
