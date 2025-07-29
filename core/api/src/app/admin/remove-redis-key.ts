import { redis } from "@/services/redis"
import { resetLimiter } from "@/services/rate-limit"
import { RateLimitConfig, RateLimitPrefix } from "@/domain/rate-limit"
import { addAttributesToCurrentSpan } from "@/services/tracing"
import { UnknownRepositoryError } from "@/domain/errors"

export const removeRedisKey = async (
  key: string,
): Promise<boolean | ApplicationError> => {
  addAttributesToCurrentSpan({ "redis.key": key })

  // Parse the key to extract rate limit config and identifier
  const keyParts = key.split(":")
  if (keyParts.length < 2) {
    return new UnknownRepositoryError(`Invalid Redis key format: '${key}'`)
  }

  const rateLimitPrefix = keyParts[0] as RateLimitPrefix
  const identifier = keyParts.slice(1).join(":")

  // Find matching rate limit config
  const rateLimitConfig = getRateLimitConfigByPrefix(rateLimitPrefix)
  if (!rateLimitConfig) {
    return new UnknownRepositoryError(`No rate limit config found for prefix: '${rateLimitPrefix}'`)
  }

  const result = await resetLimiter({
    rateLimitConfig,
    keyToConsume: identifier as IpAddress | LoginIdentifier | AccountId,
  })

  return result instanceof Error ? result : true
}

const getRateLimitConfigByPrefix = (prefix: RateLimitPrefix): RateLimitConfig | null => {
  // Find the config that matches the prefix
  for (const [, config] of Object.entries(RateLimitConfig)) {
    if (config.key === prefix) {
      return config
    }
  }
  return null
}


