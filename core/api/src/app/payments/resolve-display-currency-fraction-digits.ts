import { needsLegacyPricePrecision } from "@/app/prices/legacy-display-currency-precision"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import { addAttributesToCurrentSpan } from "@/services/tracing"

export const resolvePaymentDisplayCurrencyFractionDigits = async ({
  displayCurrency,
  persistedFractionDigits,
  timestamp,
  logger,
}: {
  displayCurrency: DisplayCurrency
  persistedFractionDigits?: number | null
  timestamp: Date
  logger: Logger
}): Promise<number> => {
  if (persistedFractionDigits !== undefined && persistedFractionDigits !== null) {
    return persistedFractionDigits
  }

  let fractionDigits = getCurrencyMajorExponent(displayCurrency)
  let source = "runtimeIcuFallback"
  let error: Error | undefined

  if (needsLegacyPricePrecision({ fractionDigits: persistedFractionDigits, timestamp })) {
    try {
      const configuredFractionDigits = await getCurrencyFractionDigits({
        currency: displayCurrency,
      })
      if (configuredFractionDigits instanceof Error) {
        error = configuredFractionDigits
      } else {
        fractionDigits = configuredFractionDigits
        source = "priceMetadataLegacyFallback"
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err))
    }
  }

  logger.warn(
    { error, displayCurrency, fallbackFractionDigits: fractionDigits, source },
    "using fallback precision for legacy payment",
  )
  addAttributesToCurrentSpan({
    "payment.displayCurrencyFractionDigitsSource": source,
    "payment.displayCurrencyFractionDigits": fractionDigits,
  })

  return fractionDigits
}
