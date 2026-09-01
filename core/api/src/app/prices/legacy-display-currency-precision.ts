// Node 24.19.0 was released after the reported COP transaction. Missing-scale
// rows before this boundary could not have been written by that runtime. Rows
// on or after it are ambiguous and must not be rescaled without a deployment audit.
const NODE_24_RELEASED_AT = Date.parse("2026-08-03T00:00:00Z")

export const needsLegacyPricePrecision = ({
  fractionDigits,
  timestamp,
}: {
  fractionDigits?: number | null
  timestamp: Date
}): boolean => {
  const isMissing = fractionDigits === undefined || fractionDigits === null
  return isMissing && timestamp.getTime() < NODE_24_RELEASED_AT
}
