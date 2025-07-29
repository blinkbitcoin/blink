import { GT } from "@/graphql/index"
import RedisKey from "@/graphql/admin/types/scalar/redis-key"

const RedisKeyRemoveInput = GT.Input({
  name: "RedisKeyRemoveInput",
  fields: () => ({
    key: { type: GT.NonNull(RedisKey) },
  }),
})

export default RedisKeyRemoveInput