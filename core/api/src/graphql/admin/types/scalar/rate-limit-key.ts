import { GT } from "@/graphql/index"

const RedisKey = GT.Scalar({
  name: "RedisKey",
  description: "A Redis key string",
  serialize: (value) => String(value),
  parseValue: (value) => {
    if (typeof value !== "string") {
      throw new Error("RedisKey must be a string")
    }
    return value
  },
})

export default RedisKey
