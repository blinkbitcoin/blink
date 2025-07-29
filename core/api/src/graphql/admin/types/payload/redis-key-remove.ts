import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"

const RedisKeyRemovePayload = GT.Object({
  name: "RedisKeyRemovePayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    success: { type: GT.Boolean },
  }),
})

export default RedisKeyRemovePayload