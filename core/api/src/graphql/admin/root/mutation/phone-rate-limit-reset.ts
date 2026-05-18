import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import PhoneRateLimitResetInput from "@/graphql/admin/types/object/phone-rate-limit-reset-input"
import PhoneRateLimitResetPayload from "@/graphql/admin/types/payload/phone-rate-limit-reset"

const PhoneRateLimitResetMutation = GT.Field<
  null,
  GraphQLAdminContext,
  { input: { phone: PhoneNumber | InputValidationError } }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(PhoneRateLimitResetPayload),
  args: {
    input: { type: GT.NonNull(PhoneRateLimitResetInput) },
  },
  resolve: async (_, args) => {
    const { phone } = args.input

    if (phone instanceof Error) {
      return {
        errors: [{ message: phone.message }],
        success: false,
      }
    }

    const result = await Admin.resetPhoneRateLimit(phone)

    if (result instanceof Error) {
      return {
        errors: [{ message: `Phone rate limit could not be reset: ${result.message}` }],
        success: false,
      }
    }

    return {
      errors: [],
      success: result,
    }
  },
})

export default PhoneRateLimitResetMutation
