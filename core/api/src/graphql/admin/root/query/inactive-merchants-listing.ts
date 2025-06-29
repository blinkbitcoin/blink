import { Merchants } from "@/app"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import Merchant from "@/graphql/shared/types/object/merchant"

const InactiveMerchantsQuery = GT.Field({
  type: GT.NonNullList(Merchant),
  resolve: async () => {
    const merchants = await Merchants.listInactiveMerchants()
    if (merchants instanceof Error) {
      throw mapError(merchants)
    }

    return merchants
  },
})

export default InactiveMerchantsQuery
