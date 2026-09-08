import { memoSharingConfig } from "@/config"
import {
  getLegacyPriceFractionDigits,
  needsLegacyPricePrecision,
} from "@/app/prices/legacy-display-currency-precision"
import { UsdDisplayCurrency } from "@/domain/fiat"
import { WalletCurrency } from "@/domain/shared"
import { WalletTransactionHistory } from "@/domain/wallets"
import { getNonEndUserWalletIds } from "@/services/ledger"

const translateLedgerTransactionWithContext = (
  txn: LedgerTransaction<WalletCurrency>,
  nonEndUserWalletIds: WalletId[],
): WalletTransaction => {
  const displayCurrency = txn.displayCurrency || UsdDisplayCurrency
  // Rows selected here are proven pre-cutoff members of ICU_48_CHANGED_CURRENCIES,
  // so their write-time scale is statically known. Use the immutable legacy
  // constant directly; current price metadata may already publish the post-CLDR-48
  // value and must never reach historical rows.
  const legacyFractionDigits = needsLegacyPricePrecision({
    currency: displayCurrency,
    fractionDigits: txn.displayCurrencyFractionDigits,
    timestamp: txn.timestamp,
  })
    ? getLegacyPriceFractionDigits(displayCurrency)
    : undefined

  return WalletTransactionHistory.fromLedger({
    txn,
    nonEndUserWalletIds,
    memoSharingConfig,
    displayCurrencyFractionDigits:
      txn.displayCurrencyFractionDigits ?? legacyFractionDigits,
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
