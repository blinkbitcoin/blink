import {
  LNURL_SERVER_LN_ADDRESS_DOMAIN,
  MAX_PAGINATION_PAGE_SIZE,
  memoSharingConfig,
} from "@/config"
import { localUsernameFromHandle } from "@/domain/contacts"
import { NoLocalUsernameForHandleError } from "@/domain/contacts/errors"
import { LedgerError } from "@/domain/ledger"
import { checkedToPaginatedQueryArgs } from "@/domain/primitives"
import { WalletTransactionHistory } from "@/domain/wallets"

import { getNonEndUserWalletIds, LedgerService } from "@/services/ledger"
import { WalletsRepository } from "@/services/mongoose"

const emptyPage = (): PaginatedQueryResult<WalletTransaction> => ({
  edges: [],
  pageInfo: { hasNextPage: false, hasPreviousPage: false },
})

export const getAccountTransactionsForContact = async ({
  account,
  contactHandle,
  rawPaginationArgs,
}: {
  account: Account
  contactHandle: Handle
  rawPaginationArgs: RawPaginationArgs
}): Promise<PaginatedQueryResult<WalletTransaction> | ApplicationError> => {
  const paginationArgs = checkedToPaginatedQueryArgs({
    paginationArgs: rawPaginationArgs,
    maxPageSize: MAX_PAGINATION_PAGE_SIZE,
  })
  if (paginationArgs instanceof Error) return paginationArgs

  const contactUsername = localUsernameFromHandle({
    handle: contactHandle,
    lnAddressDomain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
  })
  // a contact hosted elsewhere has no on-us transaction to list, which is an empty
  // history rather than a failure
  if (contactUsername instanceof NoLocalUsernameForHandleError) return emptyPage()

  const ledger = LedgerService()

  const wallets = await WalletsRepository().listByAccountId(account.id)
  if (wallets instanceof Error) return wallets

  const ledgerTxs = await ledger.getTransactionsByWalletIdAndContactUsername({
    walletIds: wallets.map((wallet) => wallet.id),
    contactUsername,
    paginationArgs,
  })
  if (ledgerTxs instanceof LedgerError) return ledgerTxs

  const nonEndUserWalletIds = Object.values(await getNonEndUserWalletIds())

  const txEdges = ledgerTxs.edges.map((edge) => {
    const transaction = WalletTransactionHistory.fromLedger({
      txn: edge.node,
      nonEndUserWalletIds,
      memoSharingConfig,
    })

    return {
      cursor: edge.cursor,
      node: transaction,
    }
  })

  return { ...ledgerTxs, edges: txEdges }
}
