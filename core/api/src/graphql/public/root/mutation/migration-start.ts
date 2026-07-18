import { MigrationFlow } from "@/app"

import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import MigrationPayload from "@/graphql/public/types/payload/migration"

const MigrationStartMutation = GT.Field<null, GraphQLPublicContextAuth>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(MigrationPayload),
  resolve: async (_, args, { domainAccount, apiKeyId }) => {
    const result = await MigrationFlow.startMigrationFlow({
      accountId: domainAccount.id,
      apiKeyId,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)] }
    }

    return {
      errors: [],
      migration: result,
    }
  },
})

export default MigrationStartMutation
