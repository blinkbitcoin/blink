import { Accounts } from "@/app"
import { mapError } from "@/graphql/error-map"
import { GT } from "@/graphql/index"
import Username from "@/graphql/shared/types/scalar/username"
import WalletCurrency from "@/graphql/shared/types/scalar/wallet-currency"
import PublicWallet from "@/graphql/public/types/object/public-wallet"

const AccountDefaultWalletQuery = GT.Field<
  null,
  GraphQLPublicContext | GraphQLPublicContextAuth
>({
  type: GT.NonNull(PublicWallet),
  args: {
    username: {
      type: GT.NonNull(Username),
    },
    walletCurrency: { type: WalletCurrency },
  },
  resolve: async (_, args, ctx) => {
    const { username, walletCurrency } = args

    if (username instanceof Error) {
      throw username
    }

    const isAuthenticated = "domainAccount" in ctx && !!ctx.domainAccount

    const wallet = await Accounts.getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: username,
      walletCurrency,
      isAuthenticated,
    })

    if (wallet instanceof Error) {
      throw mapError(wallet)
    }

    return wallet
  },
})

export default AccountDefaultWalletQuery
