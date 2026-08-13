import { Accounts } from "@/app"

import { GT } from "@/graphql/index"
import Username from "@/graphql/shared/types/scalar/username"
import AccountIdentifier from "@/graphql/public/types/object/account-identifier"
import { mapError } from "@/graphql/error-map"

const AccountIdentifierQuery = GT.Field({
  type: GT.NonNull(AccountIdentifier),
  args: {
    username: {
      type: GT.NonNull(Username),
    },
  },
  resolve: async (_, args) => {
    const { username } = args
    if (username instanceof Error) throw username

    const identifier = await Accounts.getAccountIdentifier(username)
    if (identifier instanceof Error) throw mapError(identifier)

    return identifier
  },
})

export default AccountIdentifierQuery
