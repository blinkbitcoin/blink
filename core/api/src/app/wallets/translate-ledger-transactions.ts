import { memoSharingConfig } from "@/config"
import { resolveRowFractionDigits } from "@/app/prices/legacy-display-currency-precision"
import { UsdDisplayCurrency } from "@/domain/fiat"
import { WalletCurrency } from "@/domain/shared"
import { WalletTransactionHistory } from "@/domain/wallets"
import { getNonEndUserWalletIds } from "@/services/ledger"

const translateLedgerTransactionWithContext = (
  txn: LedgerTransaction<WalletCurrency>,
  nonEndUserWalletIds: WalletId[],
): WalletTransaction => {
  const displayCurrency = txn.displayCurrency || UsdDisplayCurrency
  // The row's scale comes from the single shared policy: valid persisted
  // write-time digits win; proven pre-ICU-48 rows use the immutable legacy
  // constant; anything else is left undefined and SettlementAmounts falls back
  // to the runtime ICU exponent.
  const resolvedFractionDigits = resolveRowFractionDigits({
    currency: displayCurrency,
    fractionDigits: txn.displayCurrencyFractionDigits,
    timestamp: txn.timestamp,
  })

  return WalletTransactionHistory.fromLedger({
    txn,
    nonEndUserWalletIds,
    memoSharingConfig,
    displayCurrencyFractionDigits: resolvedFractionDigits,
  })
}

export const translateLedgerTransactions = async (
  transactions: LedgerTransaction<WalletCurrency>[],
): Promise<WalletTransaction[]> => {
  const nonEndUserWalletIds = Object.values(await getNonEndUserWalletIds())

  return transactions.map((transaction) =>
    translateLedgerTransactionWithContext(transaction, nonEndUserWalletIds),
  )
}

export const translateLedgerTransaction = async (
  transaction: LedgerTransaction<WalletCurrency>,
): Promise<WalletTransaction> => {
  const nonEndUserWalletIds = Object.values(await getNonEndUserWalletIds())
  return translateLedgerTransactionWithContext(transaction, nonEndUserWalletIds)
}

export const translateLedgerTransactionEdges = async (
  edges: PaginatedQueryResult<LedgerTransaction<WalletCurrency>>["edges"],
): Promise<PaginatedQueryResult<WalletTransaction>["edges"]> => {
  const nonEndUserWalletIds = Object.values(await getNonEndUserWalletIds())

  return edges.map(({ cursor, node }) => ({
    cursor,
    node: translateLedgerTransactionWithContext(node, nonEndUserWalletIds),
  }))
}
