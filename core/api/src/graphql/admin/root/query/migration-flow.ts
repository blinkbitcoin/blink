import { MigrationFlow } from "@/app"

import MigrationFlowDetails from "@/graphql/admin/types/object/migration-flow-details"
import { mapError } from "@/graphql/error-map"
import { GT } from "@/graphql/index"

import { CouldNotFindError } from "@/domain/errors"

const MigrationFlowQuery = GT.Field({
  args: {
    accountId: { type: GT.NonNullID },
  },
  type: MigrationFlowDetails,
  resolve: async (_, { accountId }) => {
    if (accountId instanceof Error) throw accountId

    const flow = await MigrationFlow.getMigrationFlow({ accountId })
    if (flow instanceof CouldNotFindError) return null
    if (flow instanceof Error) throw mapError(flow)

    return flow
  },
})

export default MigrationFlowQuery
