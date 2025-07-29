import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import RedisKeyRemoveInput from "@/graphql/admin/types/object/redis-key-remove-input"
import RedisKeyRemovePayload from "@/graphql/admin/types/payload/redis-key-remove"

const RedisKeyRemoveMutation = GT.Field<
  null,
  GraphQLAdminContext,
  { input: { key: string } }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(RedisKeyRemovePayload),
  args: {
    input: { type: GT.NonNull(RedisKeyRemoveInput) },
  },
  resolve: async (_, args) => {
    const { key } = args.input

    const result = await Admin.removeRedisKey(key)

    if (result instanceof Error) {
      return { 
        errors: [{ message: `Redis key '${key}' not found` }], 
        success: false 
      }
    }

    return {
      errors: [],
      success: result,
    }
  },
})

export default RedisKeyRemoveMutation
