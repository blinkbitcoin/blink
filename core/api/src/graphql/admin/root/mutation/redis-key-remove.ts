import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import RateLimitResetInput from "@/graphql/admin/types/object/rate-limit-reset-input"
import RateLimitResetPayload from "@/graphql/admin/types/payload/rate-limit-reset"

const RateLimitResetMutation = GT.Field<
  null,
  GraphQLAdminContext,
  { input: { key: string } }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(RateLimitResetPayload),
  args: {
    input: { type: GT.NonNull(RateLimitResetInput) },
  },
  resolve: async (_, args) => {
    const { key } = args.input

    const result = await Admin.resetRateLimit(key)

    if (result instanceof Error) {
      return { 
        errors: [{ message: `Rate limit key '${key}' could not be reset: ${result.message}` }], 
        success: false 
      }
    }

    return {
      errors: [],
      success: result,
    }
  },
})

export default RateLimitResetMutation
