import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import AccountMigration from "@/graphql/public/types/object/account-migration"

import { MigrationFlow } from "@/app"

import { CouldNotFindError } from "@/domain/errors"
import { MigrationFlowPhase } from "@/domain/migration-flow"

const MigrationQuery = GT.Field<null, GraphQLPublicContextAuth>({
  type: AccountMigration,
  resolve: async (_source, _args, { domainAccount }) => {
    const result = await MigrationFlow.resumeMigrationFlow({
      accountId: domainAccount.id,
    })

    if (result instanceof CouldNotFindError) {
      return { accountId: domainAccount.id, phase: MigrationFlowPhase.NotStarted }
    }

    if (result instanceof Error) {
      throw mapError(result)
    }

    return result
  },
})

export default MigrationQuery
