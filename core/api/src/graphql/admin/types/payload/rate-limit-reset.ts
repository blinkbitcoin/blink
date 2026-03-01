import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"

const RateLimitResetPayload = GT.Object({
  name: "RateLimitResetPayload",
  fields: () => ({
    errors: { type: GT.NonNullList(IError) },
    success: { type: GT.Boolean },
  }),
})

export default RateLimitResetPayload
