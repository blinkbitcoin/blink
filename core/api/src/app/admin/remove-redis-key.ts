import { redis } from "@/services/redis"
import { addAttributesToCurrentSpan } from "@/services/tracing"
import { UnknownRepositoryError } from "@/domain/errors"

export const removeRedisKey = async (
  key: string,
): Promise<boolean | ApplicationError> => {
  addAttributesToCurrentSpan({ "redis.key": key })

  const exists = await redis.exists(key)
  
  if (!exists) {
    return new UnknownRepositoryError(`Redis key '${key}' not found`)
  }
  
  const result = await redis.del(key)
  return result > 0
}


