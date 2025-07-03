import { OnChain } from "@/app"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import PayoutSpeeds from "@/graphql/public/types/object/payout-speeds"

const PayoutSpeedsQuery = GT.Field({
  type: GT.NonNullList(PayoutSpeeds),
  description: "Returns the list of available speeds for on-chain payments",
  resolve: async () => {
    const queues = await OnChain.listPayoutQueues()
    if (queues instanceof Error) throw mapError(queues)

    return queues
  },
})

export default PayoutSpeedsQuery
