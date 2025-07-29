import { GT } from "@/graphql/index"
import RateLimitKey from "@/graphql/admin/types/scalar/rate-limit-key"

const RateLimitResetInput = GT.Input({
  name: "RateLimitResetInput",
  fields: () => ({
    key: { type: GT.NonNull(RateLimitKey) },
  }),
})

export default RateLimitResetInput
