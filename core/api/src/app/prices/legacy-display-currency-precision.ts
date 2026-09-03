// CLDR 48 changed these currencies' standard fraction digits from 2 to 0.
const ICU_48_CHANGED_CURRENCIES = new Set(["COP", "HUF", "IDR", "PKR"])

// blink-deployments commit 6372c3c made the first Node 24 image available to
// production. Using that commit time as the earliest possible rollout avoids
// rescaling rows that may have been written while the deployment was in progress.
const ICU_48_ROLLOUT_EARLIEST_AT = Date.parse("2026-08-31T13:30:27Z")

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
    timestamp.getTime() < ICU_48_ROLLOUT_EARLIEST_AT
  )
}
