import { MigrationFlow } from "@/app"

import { GT } from "@/graphql/index"
import AccountId from "@/graphql/shared/types/scalar/account-id"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import MigrationRetryGrantPayload from "@/graphql/admin/types/payload/migration-retry-grant"

const MigrationRetryGrantInput = GT.Input({
  name: "MigrationRetryGrantInput",
  fields: () => ({
    accountId: {
      type: GT.NonNull(AccountId),
    },
  }),
})

const MigrationRetryGrantMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      accountId: AccountId | Error
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(MigrationRetryGrantPayload),
  args: {
    input: { type: GT.NonNull(MigrationRetryGrantInput) },
  },
  resolve: async (_, args, { privilegedClientId }) => {
    const { accountId } = args.input

    if (accountId instanceof Error)
      return { errors: [{ message: accountId.message }], success: false }

    const result = await MigrationFlow.retryMigrationFlow({
      accountId,
      updatedByPrivilegedClientId: privilegedClientId,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)], success: false }
    }

    return { errors: [], success: true }
  },
})

export default MigrationRetryGrantMutation
