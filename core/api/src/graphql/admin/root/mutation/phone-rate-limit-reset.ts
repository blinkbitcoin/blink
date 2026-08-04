import { createHmac } from "crypto"

import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import { KRATOS_MASTER_USER_PASSWORD } from "@/config"
import PhoneRateLimitResetInput from "@/graphql/admin/types/object/phone-rate-limit-reset-input"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const phoneHashForAudit = (phone: PhoneNumber, key: string): string =>
  createHmac("sha256", key).update(`phone-rate-limit-reset:${phone}`).digest("hex")

const PhoneRateLimitResetMutation = GT.Field<
  null,
  GraphQLAdminContext,
  { input: { phone: PhoneNumber | InputValidationError } }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(PhoneRateLimitResetInput) },
  },
  resolve: async (_, args, { logger, privilegedClientId }) => {
    const { phone } = args.input

    if (phone instanceof Error) {
      return {
        errors: [{ message: phone.message }],
        success: false,
      }
    }

    const result = await Admin.resetPhoneRateLimit(phone)
    logger.info(
      {
        privilegedClientId,
        phoneHash: phoneHashForAudit(phone, KRATOS_MASTER_USER_PASSWORD),
        success: !(result instanceof Error),
      },
      "Phone auth rate limit reset",
    )

    if (result instanceof Error) {
      return {
        errors: [mapAndParseErrorForGqlResponse(result)],
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
