import { GT } from "@/graphql/index"
import CustodialRestrictions from "@/graphql/public/types/object/custodial-restrictions"

import { Accounts } from "@/app"

const CustodialRestrictionsQuery = GT.Field<null, GraphQLPublicContextAuth>({
  type: GT.NonNull(CustodialRestrictions),
  resolve: async (_source, _args, { domainAccount, ip }) =>
    Accounts.getCustodialRestrictions(
      ip ? { account: domainAccount, ip } : { account: domainAccount },
    ),
})

export default CustodialRestrictionsQuery
