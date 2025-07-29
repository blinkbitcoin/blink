import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const RedisKeysSearchQuery = GT.Field<null, GraphQLAdminContext, { pattern: string }>({
  extensions: {
    complexity: 100,
  },
  type: GT.NonNullList(GT.String),
  args: {
    pattern: { type: GT.NonNull(GT.String) },
  },
  resolve: async (_, args) => {
    const result = await Admin.searchRedisKeys(args.pattern)

    if (result instanceof Error) {
      throw mapAndParseErrorForGqlResponse(result)
    }

    return result
  },
})

export default RedisKeysSearchQuery
