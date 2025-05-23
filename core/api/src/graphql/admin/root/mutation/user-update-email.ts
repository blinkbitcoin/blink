import { GT } from "@/graphql/index"

import AccountDetailPayload from "@/graphql/admin/types/payload/account-detail"
import { Admin } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import AccountId from "@/graphql/shared/types/scalar/account-id"
import EmailAddress from "@/graphql/shared/types/scalar/email-address"

const UserUpdateEmailInput = GT.Input({
  name: "UserUpdateEmailInput",
  fields: () => ({
    accountId: {
      type: GT.NonNull(AccountId),
    },
    email: {
      type: GT.NonNull(EmailAddress),
    },
  }),
})

const UserUpdateEmailMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: { accountId: string; email: EmailAddress | Error }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(AccountDetailPayload),
  args: {
    input: { type: GT.NonNull(UserUpdateEmailInput) },
  },
  resolve: async (_, args, { privilegedClientId }) => {
    const { accountId, email } = args.input
    for (const input of [accountId, email]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    if (email instanceof Error) return { errors: [{ message: email.message }] }

    const account = await Admin.updateUserEmail({
      accountId,
      email,
      updatedByPrivilegedClientId: privilegedClientId,
    })
    if (account instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(account)] }
    }
    return { errors: [], accountDetails: account }
  },
})

export default UserUpdateEmailMutation
