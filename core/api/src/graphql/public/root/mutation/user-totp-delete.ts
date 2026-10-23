import { GT } from "@/graphql/index"

import { Authentication } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import TotpCode from "@/graphql/public/types/scalar/totp-code"
import UserTotpDeletePayload from "@/graphql/public/types/payload/user-totp-delete"

const UserTotpDeleteInput = GT.Input({
  name: "UserTotpDeleteInput",
  fields: () => ({
    totpCode: {
      type: TotpCode,
    },
  }),
})

const UserTotpDeleteMutation = GT.Field<null, GraphQLPublicContextAuth>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(UserTotpDeletePayload),
  args: {
    input: { type: UserTotpDeleteInput },
  },
  resolve: async (_, __, { user, domainAccount }) => {
    const allowed = await Authentication.checkTotpRemovalAllowed({
      accountId: domainAccount.id,
    })
    if (allowed instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(allowed)] }
    }

    const me = await Authentication.removeTotp({
      userId: user.id,
    })

    if (me instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(me)] }
    }

    return { errors: [], me }
  },
})

export default UserTotpDeleteMutation
