import { translateLedgerTransactionEdges } from "./translate-ledger-transactions"

import { MAX_PAGINATION_PAGE_SIZE } from "@/config"

import { LedgerError } from "@/domain/ledger"

import { LedgerService } from "@/services/ledger"
import { checkedToPaginatedQueryArgs } from "@/domain/primitives"

export const getTransactionsForWalletsByAddresses = async ({
  wallets,
  addresses,
  rawPaginationArgs,
}: {
  wallets: Wallet[]
  addresses: OnChainAddress[]
  rawPaginationArgs: RawPaginationArgs
}): Promise<PaginatedQueryResult<WalletTransaction> | ApplicationError> => {
  const paginationArgs = checkedToPaginatedQueryArgs({
    paginationArgs: rawPaginationArgs,
    maxPageSize: MAX_PAGINATION_PAGE_SIZE,
  })

  if (paginationArgs instanceof Error) {
    return paginationArgs
  }

  const walletIds = wallets.map((wallet) => wallet.id)

  const ledgerTxs = await LedgerService().getTransactionsByWalletIdsAndAddresses({
    walletIds,
    paginationArgs,
    addresses,
  })

  if (ledgerTxs instanceof LedgerError) {
    return ledgerTxs
  }

  const txEdges = await translateLedgerTransactionEdges(ledgerTxs.edges)

  return { ...ledgerTxs, edges: txEdges }
}
