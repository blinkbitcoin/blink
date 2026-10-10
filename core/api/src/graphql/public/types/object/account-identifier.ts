import AccountProvider from "../scalar/account-provider"

import { GT } from "@/graphql/index"

const AccountIdentifier = GT.Object<AccountIdentifier>({
  name: "AccountIdentifier",
  fields: () => ({
    exists: {
      type: GT.NonNull(GT.Boolean),
      description: "Whether a Blink account exists for the given username.",
    },
    provider: {
      type: AccountProvider,
      description:
        "The backing provider of the account (blink or spark). Null when the account does not exist.",
    },
  }),
})

export default AccountIdentifier
