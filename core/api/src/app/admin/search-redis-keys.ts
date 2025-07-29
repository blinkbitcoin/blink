import { redis } from "@/services/redis"
import { addAttributesToCurrentSpan } from "@/services/tracing"
import { UnknownRepositoryError } from "@/domain/errors"

export const searchRedisKeys = async (
  pattern: string,
): Promise<string[] | ApplicationError> => {
  addAttributesToCurrentSpan({ "redis.pattern": pattern })

  try {
    const keys = await redis.keys(pattern)
    return keys
  } catch (err) {
    return new UnknownRepositoryError(err)
  }
}
