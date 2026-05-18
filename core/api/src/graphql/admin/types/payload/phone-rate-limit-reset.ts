import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"

const PhoneRateLimitResetPayload = GT.Object({
  name: "PhoneRateLimitResetPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    success: { type: GT.Boolean },
  }),
})

export default PhoneRateLimitResetPayload
