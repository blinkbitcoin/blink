import { GT } from "@/graphql/index"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import TotpCode from "@/graphql/public/types/scalar/totp-code"
import UserEmailDeletePayload from "@/graphql/public/types/payload/user-email-delete"

const UserEmailDeleteInput = GT.Input({
  name: "UserEmailDeleteInput",
  fields: () => ({
    totpCode: {
      type: TotpCode,
    },
  }),
})

const UserEmailDeleteMutation = GT.Field<null, GraphQLPublicContextAuth>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(UserEmailDeletePayload),
  args: {
    input: { type: UserEmailDeleteInput },
  },
  resolve: async (_, args, { user }) => {
    const me = await Authentication.removeEmail({
      userId: user.id,
    })

    if (me instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(me)] }
    }

    return { errors: [], me }
  },
})

export default UserEmailDeleteMutation
