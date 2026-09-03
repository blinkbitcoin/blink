// CLDR 48 changed these currencies' standard fraction digits from 2 to 0.
// Pre-rollout rows carry 2-digit minor units. That write-time scale is
// immutable history, so the fallback must not depend on current price metadata
// or the runtime's ICU version.
const ICU_48_CHANGED_CURRENCIES = new Set(["COP", "HUF", "IDR", "PKR"])
const ICU_48_LEGACY_FRACTION_DIGITS = 2

// Production deployment 1348 started two ICU 48 API pods while the ICU 76 pods
// were still draining. Kubernetes events and API spans show the first ICU 48 pod
// serving at this instant. The old pods served until 14:12:25Z, but no ledger
// writes were observed during that overlap. Keep the earlier boundary so a new
// runtime row can never be rescaled as legacy.
const ICU_48_PRODUCTION_FIRST_SERVED_AT = Date.parse("2026-08-31T14:11:14Z")

export const getLegacyPriceFractionDigits = (
  currency: DisplayCurrency,
): number | undefined =>
  ICU_48_CHANGED_CURRENCIES.has(currency) ? ICU_48_LEGACY_FRACTION_DIGITS : undefined

export const needsLegacyPricePrecision = ({
  currency,
  fractionDigits,
  timestamp,
}: {
  currency: DisplayCurrency
  fractionDigits?: number | null
  timestamp: Date
}): boolean => {
  const isMissing = fractionDigits === undefined || fractionDigits === null
  return (
    isMissing &&
    ICU_48_CHANGED_CURRENCIES.has(currency) &&
    timestamp.getTime() < ICU_48_PRODUCTION_FIRST_SERVED_AT
  )
}
