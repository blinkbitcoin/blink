import { GT } from "@/graphql/index"
import PayoutSpeed from "@/graphql/public/types/scalar/payout-speed"

const PayoutSpeedsObject = GT.Object({
  name: "PayoutSpeeds",
  fields: () => ({
    speed: {
      type: GT.NonNull(PayoutSpeed),
    },
    displayName: {
      type: GT.NonNull(GT.String),
    },
    description: {
      type: GT.NonNull(GT.String),
    },
  }),
})

export default PayoutSpeedsObject
