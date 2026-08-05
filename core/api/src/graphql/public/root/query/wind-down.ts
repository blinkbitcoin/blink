import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import AccountWindDown from "@/graphql/public/types/object/account-wind-down"

import { WindDown } from "@/app"

const WindDownQuery = GT.Field<null, GraphQLPublicContextAuth>({
  type: AccountWindDown,
  resolve: async (_source, _args, { domainAccount }) => {
    const result = await WindDown.getAccountWindDown({ account: domainAccount })

    if (result instanceof Error) {
      throw mapError(result)
    }

    return result
  },
})

export default WindDownQuery
