import { checkedFractionDigits, getCurrencyMajorExponent } from "@/domain/fiat"
import { ErrorLevel } from "@/domain/shared"

import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

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

// A row provably written by a pre-CLDR-48 runtime: its currency's digits
// changed in CLDR 48 and it predates the first ICU 48 pod.
const isPreIcu48Row = ({
  currency,
  timestamp,
}: {
  currency: DisplayCurrency
  timestamp: Date
}): boolean =>
  ICU_48_CHANGED_CURRENCIES.has(currency) &&
  timestamp.getTime() < ICU_48_PRODUCTION_FIRST_SERVED_AT

// The one resolution policy for a ledger row's display scale, shared by the
// history translation and payment reimbursement paths so the two can never
// drift: a valid persisted write-time value wins; a proven pre-ICU-48 row falls
// back to the immutable legacy constant; anything else leaves value undefined
// for the caller's runtime fallback. The source travels with the value.
//
// A persisted value outside the shared 0..MAX_FRACTION_DIGITS bound is corrupt;
// it is treated as missing rather than written into a malformed display amount.
// This read-path policy has no tracing side effects. Payment callers report at
// their bounded send/settlement edge instead of recording per history row.
type RowFractionDigitsResolution =
  | { value: number; source: "persisted" | "legacyConstantFallback" }
  | { value: undefined; source: "runtimeIcuFallback" }

export const resolveRowFractionDigits = ({
  currency,
  fractionDigits,
  timestamp,
}: {
  currency: DisplayCurrency
  fractionDigits?: number | null
  timestamp: Date
}): RowFractionDigitsResolution => {
  if (fractionDigits !== undefined && fractionDigits !== null) {
    const checked = checkedFractionDigits({ fractionDigits })
    if (checked !== undefined) return { value: checked, source: "persisted" }
  }

  return isPreIcu48Row({ currency, timestamp })
    ? { value: ICU_48_LEGACY_FRACTION_DIGITS, source: "legacyConstantFallback" }
    : { value: undefined, source: "runtimeIcuFallback" }
}

// Payment-path wrapper around resolveRowFractionDigits: resolves to a concrete
// scale (ICU as the last resort) and reports the source on the current span.
// Total by design: precision must never block settlement, so there is no error
// return and no logger - the span attributes are the queryable record, and only
// the legacy-constant branch (a genuine anomaly worth surfacing) also records
// an exception.
export const resolvePaymentDisplayCurrencyFractionDigits = ({
  displayCurrency,
  persistedFractionDigits,
  timestamp,
}: {
  displayCurrency: DisplayCurrency
  persistedFractionDigits?: number | null
  timestamp: Date
}): number => {
  const { value: rowFractionDigits, source } = resolveRowFractionDigits({
    currency: displayCurrency,
    fractionDigits: persistedFractionDigits,
    timestamp,
  })

  const fractionDigits = rowFractionDigits ?? getCurrencyMajorExponent(displayCurrency)

  if (source === "legacyConstantFallback") {
    recordExceptionInCurrentSpan({
      error: new Error(
        `resolved legacy display precision for ${displayCurrency} from the immutable constant`,
      ),
      level: ErrorLevel.Warn,
    })
  }
  addAttributesToCurrentSpan({
    "payment.displayCurrencyFractionDigitsSource": source,
    "payment.displayCurrencyFractionDigits": fractionDigits,
  })

  return fractionDigits
}
