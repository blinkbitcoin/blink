import { GT } from "@/graphql/index"
import Phone from "@/graphql/shared/types/scalar/phone"

const PhoneRateLimitResetInput = GT.Input({
  name: "PhoneRateLimitResetInput",
  fields: () => ({
    phone: { type: GT.NonNull(Phone) },
  }),
})

export default PhoneRateLimitResetInput
