import { Accounts } from "@/app"

import { GT } from "@/graphql/index"
import AccountId from "@/graphql/shared/types/scalar/account-id"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import AccountForceDeletePayload from "@/graphql/admin/types/payload/account-force-delete"

const AccountForceDeleteInput = GT.Input({
  name: "AccountForceDeleteInput",
  fields: () => ({
    accountId: {
      type: GT.NonNull(AccountId),
    },
    cancelIfPositiveBalance: {
      type: GT.Boolean,
      defaultValue: true,
    },
  }),
})

const AccountForceDeleteMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      accountId: AccountId | Error
      cancelIfPositiveBalance?: boolean
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(AccountForceDeletePayload),
  args: {
    input: { type: GT.NonNull(AccountForceDeleteInput) },
  },
  resolve: async (_, args, { privilegedClientId }) => {
    const { accountId, cancelIfPositiveBalance = true } = args.input

    if (accountId instanceof Error)
      return { errors: [{ message: accountId.message }], success: false }

    const result = await Accounts.markAccountForDeletion({
      accountId,
      cancelIfPositiveBalance,
      bypassMaxDeletions: true,
      updatedByPrivilegedClientId: privilegedClientId,
    })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)], success: false }
    }

    return { errors: [], success: true }
  },
})

export default AccountForceDeleteMutation
