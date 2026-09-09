import {
  getLegacyPriceFractionDigits,
  needsLegacyPricePrecision,
} from "@/app/prices/legacy-display-currency-precision"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import { addAttributesToCurrentSpan } from "@/services/tracing"

export const resolvePaymentDisplayCurrencyFractionDigits = ({
  displayCurrency,
  persistedFractionDigits,
  timestamp,
  logger,
}: {
  displayCurrency: DisplayCurrency
  persistedFractionDigits?: number | null
  timestamp: Date
  logger: Logger
}): number => {
  if (persistedFractionDigits !== undefined && persistedFractionDigits !== null) {
    return persistedFractionDigits
  }

  // persistedFractionDigits is provably missing at this point (the early return
  // above handled a persisted value), so isMissing is always true inside the
  // predicate. The parameter stays in the shared signature for callers that do
  // not pre-filter, e.g. translate-ledger-transactions.
  //
  // Rows selected here are proven pre-cutoff members of ICU_48_CHANGED_CURRENCIES,
  // so their write-time scale is statically known: use the immutable legacy
  // constant. Current price metadata may already publish the post-CLDR-48 value
  // and must never reach legacy rows, same policy as
  // translate-ledger-transactions.
  const legacyFractionDigits = needsLegacyPricePrecision({
    currency: displayCurrency,
    fractionDigits: persistedFractionDigits,
    timestamp,
  })
    ? getLegacyPriceFractionDigits(displayCurrency)
    : undefined

  const source =
    legacyFractionDigits !== undefined ? "legacyConstantFallback" : "runtimeIcuFallback"
  const fractionDigits = legacyFractionDigits ?? getCurrencyMajorExponent(displayCurrency)

  logger.warn(
    { displayCurrency, fallbackFractionDigits: fractionDigits, source },
    "using fallback display precision for payment without persisted scale",
  )
  addAttributesToCurrentSpan({
    "payment.displayCurrencyFractionDigitsSource": source,
    "payment.displayCurrencyFractionDigits": fractionDigits,
  })

  return fractionDigits
}
