import { resetRateLimit } from "@/app/admin/remove-redis-key"
import { RateLimitConfig } from "@/domain/rate-limit"
import { RedisRateLimitService, resetLimiter } from "@/services/rate-limit"

describe("resetRateLimit integration", () => {
  const keyToConsume = "testAccountId" as AccountId;
  const rateLimitConfig = RateLimitConfig.invoiceCreate;

  beforeEach(async () => {
    // Ensure clean state
    await resetLimiter({
      rateLimitConfig,
      keyToConsume,
    });
  });

  it("actually resets rate limit in Redis", async () => {
    const rateLimit = RedisRateLimitService({
      keyPrefix: rateLimitConfig.key,
      limitOptions: rateLimitConfig.limits,
    });

    // Consume all available points
    for (let i = 0; i < rateLimitConfig.limits.points; i++) {
      await rateLimit.consume(keyToConsume);
    }

    // Verify rate limit is exceeded
    const exceededResult = await rateLimit.consume(keyToConsume);
    expect(exceededResult).toBeInstanceOf(Error);

    // Reset the rate limit
    const resetKey = `${rateLimitConfig.key}:${keyToConsume}`;
    const resetResult = await resetRateLimit(resetKey);
    expect(resetResult).toBe(true);

    // Verify rate limit is reset
    const afterResetResult = await rateLimit.consume(keyToConsume);
    expect(afterResetResult).not.toBeInstanceOf(Error);
  });
});
