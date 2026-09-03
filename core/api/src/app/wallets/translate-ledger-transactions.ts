import { memoSharingConfig } from "@/config"
import { needsLegacyPricePrecision } from "@/app/prices/legacy-display-currency-precision"
import { getCurrencyMajorExponent, UsdDisplayCurrency } from "@/domain/fiat"
import { ErrorLevel, WalletCurrency } from "@/domain/shared"
import { WalletTransactionHistory } from "@/domain/wallets"
import { getNonEndUserWalletIds } from "@/services/ledger"
import { baseLogger } from "@/services/logger"
import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

type TranslationContext = {
  fractionDigitsByCurrency: Map<DisplayCurrency, number>
  nonEndUserWalletIds: WalletId[]
}

const resolveFractionDigits = async (
  currency: DisplayCurrency,
): Promise<[DisplayCurrency, number]> => {
  let fractionDigits = await getCurrencyFractionDigits({ currency })
  if (fractionDigits instanceof Error) {
    const error = fractionDigits
    fractionDigits = getCurrencyMajorExponent(currency)
    baseLogger.warn(
      { error, currency, fallbackFractionDigits: fractionDigits },
      "using ICU precision for legacy transaction history",
    )
    recordExceptionInCurrentSpan({ error, level: ErrorLevel.Warn })
  }

  return [currency, fractionDigits]
}

const getTranslationContext = async (
  transactions: LedgerTransaction<WalletCurrency>[],
): Promise<TranslationContext> => {
  const displayCurrencies = [
    ...new Set(
      transactions
        .filter((transaction) =>
          needsLegacyPricePrecision({
            currency: transaction.displayCurrency || UsdDisplayCurrency,
            fractionDigits: transaction.displayCurrencyFractionDigits,
            timestamp: transaction.timestamp,
          }),
        )
        .map((transaction) => transaction.displayCurrency || UsdDisplayCurrency),
    ),
  ]

  const nonEndUserWalletIdsPromise = getNonEndUserWalletIds()
  const fractionDigits: [DisplayCurrency, number][] = []
  for (const currency of displayCurrencies) {
    fractionDigits.push(await resolveFractionDigits(currency))
  }

  return {
    fractionDigitsByCurrency: new Map(fractionDigits),
    nonEndUserWalletIds: Object.values(await nonEndUserWalletIdsPromise),
  }
}

const translateLedgerTransactionWithContext = (
  txn: LedgerTransaction<WalletCurrency>,
  { fractionDigitsByCurrency, nonEndUserWalletIds }: TranslationContext,
): WalletTransaction => {
  const displayCurrency = txn.displayCurrency || UsdDisplayCurrency
  const legacyFractionDigits = needsLegacyPricePrecision({
    currency: displayCurrency,
    fractionDigits: txn.displayCurrencyFractionDigits,
    timestamp: txn.timestamp,
  })
    ? fractionDigitsByCurrency.get(displayCurrency)
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
  const context = await getTranslationContext(transactions)

  return transactions.map((transaction) =>
    translateLedgerTransactionWithContext(transaction, context),
  )
}

export const translateLedgerTransaction = async (
  transaction: LedgerTransaction<WalletCurrency>,
): Promise<WalletTransaction> => {
  const context = await getTranslationContext([transaction])
  return translateLedgerTransactionWithContext(transaction, context)
}

export const translateLedgerTransactionEdges = async (
  edges: PaginatedQueryResult<LedgerTransaction<WalletCurrency>>["edges"],
): Promise<PaginatedQueryResult<WalletTransaction>["edges"]> => {
  const context = await getTranslationContext(edges.map(({ node }) => node))

  return edges.map(({ cursor, node }) => ({
    cursor,
    node: translateLedgerTransactionWithContext(node, context),
  }))
}
