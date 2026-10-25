jest.mock("@/app", () => ({
  Accounts: { getDefaultWalletByUsernameOrPhone: jest.fn() },
}))

import { Accounts } from "@/app"
import AccountDefaultWalletQuery from "@/graphql/public/root/query/account-default-wallet"

const mockGetDefaultWalletByUsernameOrPhone =
  Accounts.getDefaultWalletByUsernameOrPhone as jest.Mock

const wallet = { id: "wallet-id" } as Wallet
const args = { username: "alice", walletCurrency: "USD" }

const anonCtx = {} as GraphQLPublicContext
const authCtx = { domainAccount: { id: "account-id" } } as GraphQLPublicContextAuth

describe("Query.accountDefaultWallet", () => {
  const resolve = AccountDefaultWalletQuery.resolve
  if (!resolve) throw new Error("accountDefaultWallet must define a resolver")

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetDefaultWalletByUsernameOrPhone.mockResolvedValue(wallet)
  })

  it.each([
    ["anonymous", anonCtx, false],
    ["authenticated", authCtx, true],
  ])("passes isAuthenticated for an %s caller", async (_label, ctx, expected) => {
    const result = await resolve(null, args, ctx, {} as never)

    expect(result).toBe(wallet)
    expect(mockGetDefaultWalletByUsernameOrPhone).toHaveBeenCalledWith({
      usernameOrPhone: "alice",
      walletCurrency: "USD",
      isAuthenticated: expected,
    })
  })
})
