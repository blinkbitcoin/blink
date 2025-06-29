import { getTransactionsForAccountByWalletIds } from "@/app/accounts"

import { AccountsRepository, MerchantsRepository } from "@/services/mongoose"

const INACTIVE_MONTHS = 6

export const listInactiveMerchants = async (): Promise<
  BusinessMapMarker[] | ApplicationError
> => {
  const merchantsRepo = MerchantsRepository()
  const accountsRepo = AccountsRepository()

  const merchants = await merchantsRepo.listForMap()
  if (merchants instanceof Error) return merchants

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - INACTIVE_MONTHS)

  const inactiveMerchants: BusinessMapMarker[] = []
  for (const merchant of merchants) {
    if (merchant.createdAt > sixMonthsAgo) continue

    const account = await accountsRepo.findByUsername(merchant.username)
    if (account instanceof Error) continue

    const transactionsResult = await getTransactionsForAccountByWalletIds({
      account,
      rawPaginationArgs: { first: 1 },
    })
    if (transactionsResult instanceof Error) continue

    const transactions = transactionsResult.edges

    const lastTransactionDate =
      transactions.length > 0 ? transactions[0].node.createdAt : new Date(0)

    if (lastTransactionDate < sixMonthsAgo) {
      inactiveMerchants.push(merchant)
    }
  }
  return inactiveMerchants
}
