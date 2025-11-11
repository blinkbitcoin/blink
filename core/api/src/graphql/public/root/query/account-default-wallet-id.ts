import { Accounts } from "@/app"
import { mapError } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import Username from "@/graphql/shared/types/scalar/username"
import WalletId from "@/graphql/shared/types/scalar/wallet-id"

const AccountDefaultWalletIdQuery = GT.Field({
  deprecationReason: "will be migrated to AccountDefaultWalletId",
  type: GT.NonNull(WalletId),
  args: {
    username: {
      type: GT.NonNull(Username),
    },
  },
  resolve: async (_, args) => {
    const { username } = args

    if (username instanceof Error) {
      throw username
    }

    const account = await Accounts.getAccountForUsername(username)
    if (account instanceof Error) {
      throw mapError(account)
    }

    const walletId = account.defaultWalletId
    return walletId
  },
})

export default AccountDefaultWalletIdQuery
