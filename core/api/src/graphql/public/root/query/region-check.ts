import { GT } from "@/graphql/index"
import RegionCheck from "@/graphql/public/types/object/region-check"

import { Accounts } from "@/app"

// per-IP abuse is bounded by the ingress rpm limit; vendor spend by the daily budget
const RegionCheckQuery = GT.Field<null, GraphQLPublicContext>({
  type: GT.NonNull(RegionCheck),
  resolve: async (_source, _args, { ip }) =>
    Accounts.getSessionRegionVerdict(ip ? { ip } : {}),
})

export default RegionCheckQuery
