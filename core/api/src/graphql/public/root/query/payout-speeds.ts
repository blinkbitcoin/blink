import { OnChain } from "@/app"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import PayoutSpeedsObject from "@/graphql/public/types/object/payout-speeds"

const PayoutSpeedsQuery = GT.Field({
  type: GT.NonNullList(PayoutSpeedsObject),
  description: "Returns the list of available speeds for on-chain payments",
  resolve: async () => {
    const queues = OnChain.getPayoutSpeeds()
    if (queues instanceof Error) throw mapError(queues)

    return queues
  },
})

export default PayoutSpeedsQuery
