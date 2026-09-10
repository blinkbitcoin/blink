import {
  resolvePaymentDisplayCurrencyFractionDigits,
  resolveRowFractionDigits,
} from "@/app/prices/legacy-display-currency-precision"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

const mockAddAttributes = addAttributesToCurrentSpan as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock
const COP = "COP" as DisplayCurrency

const PRE_CUTOFF = new Date("2026-07-03T00:00:00Z")
const POST_CUTOFF = new Date("2026-09-01T00:00:00Z")

afterEach(() => jest.clearAllMocks())

describe("resolveRowFractionDigits", () => {
  it("returns the resolution source with the value", () => {
    expect(
      resolveRowFractionDigits({
        currency: COP,
        fractionDigits: 2,
        timestamp: PRE_CUTOFF,
      }),
    ).toEqual({ value: 2, source: "persisted" })
  })

  it.each([20, -1, 1.5, NaN, Infinity])(
    "discards corrupt legacy scale %s without read-path diagnostics",
    (fractionDigits) => {
      expect(
        resolveRowFractionDigits({
          currency: COP,
          fractionDigits,
          timestamp: PRE_CUTOFF,
        }),
      ).toEqual({ value: 2, source: "legacyConstantFallback" })
      expect(mockRecordException).not.toHaveBeenCalled()
    },
  )

  it("preserves the maximum supported persisted scale", () => {
    expect(
      resolveRowFractionDigits({
        currency: COP,
        fractionDigits: 4,
        timestamp: PRE_CUTOFF,
      }),
    ).toEqual({ value: 4, source: "persisted" })
  })

  it("returns a valid persisted scale", () => {
    expect(
      resolveRowFractionDigits({
        currency: COP,
        fractionDigits: 2,
        timestamp: PRE_CUTOFF,
      }),
    ).toEqual({ value: 2, source: "persisted" })
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("returns a persisted zero scale (falsy but valid)", () => {
    expect(
      resolveRowFractionDigits({
        currency: COP,
        fractionDigits: 0,
        timestamp: POST_CUTOFF,
      }),
    ).toEqual({ value: 0, source: "persisted" })
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("treats a persisted null as missing", () => {
    expect(
      resolveRowFractionDigits({
        currency: COP,
        fractionDigits: null,
        timestamp: PRE_CUTOFF,
      }),
    ).toEqual({ value: 2, source: "legacyConstantFallback" })
  })

  it("discards an out-of-range persisted scale without recording on the read path", () => {
    const result = resolveRowFractionDigits({
      currency: COP,
      fractionDigits: 20,
      timestamp: POST_CUTOFF,
    })

    expect(result).toEqual({ value: undefined, source: "runtimeIcuFallback" })
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("returns the immutable legacy constant for a pre-cutoff row without persisted digits", () => {
    expect(resolveRowFractionDigits({ currency: COP, timestamp: PRE_CUTOFF })).toEqual({
      value: 2,
      source: "legacyConstantFallback",
    })
  })

  it("returns undefined for a post-cutoff row without persisted digits", () => {
    expect(resolveRowFractionDigits({ currency: COP, timestamp: POST_CUTOFF })).toEqual({
      value: undefined,
      source: "runtimeIcuFallback",
    })
  })

  it("returns undefined for a pre-cutoff row in a currency CLDR 48 did not change", () => {
    expect(
      resolveRowFractionDigits({
        currency: "EUR" as DisplayCurrency,
        timestamp: PRE_CUTOFF,
      }),
    ).toEqual({ value: undefined, source: "runtimeIcuFallback" })
  })
})

describe("resolvePaymentDisplayCurrencyFractionDigits", () => {
  it("discards corrupt legacy precision and records only the payment fallback", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      persistedFractionDigits: 20,
      timestamp: PRE_CUTOFF,
    })

    expect(result).toBe(2)
    expect(mockRecordException).toHaveBeenCalledTimes(1)
    expect(mockRecordException).toHaveBeenCalledWith({
      error: new Error(
        "resolved legacy display precision for COP from the immutable constant",
      ),
      level: "warn",
    })
    expect(mockAddAttributes).toHaveBeenCalledWith({
      "payment.displayCurrencyFractionDigitsSource": "legacyConstantFallback",
      "payment.displayCurrencyFractionDigits": 2,
    })
  })

  it("discards corrupt post-cutoff precision without a legacy warning", () => {
    expect(
      resolvePaymentDisplayCurrencyFractionDigits({
        displayCurrency: COP,
        persistedFractionDigits: 20,
        timestamp: POST_CUTOFF,
      }),
    ).toBe(getCurrencyMajorExponent(COP))
    expect(mockRecordException).not.toHaveBeenCalled()
    expect(mockAddAttributes).toHaveBeenCalledWith({
      "payment.displayCurrencyFractionDigitsSource": "runtimeIcuFallback",
      "payment.displayCurrencyFractionDigits": getCurrencyMajorExponent(COP),
    })
  })

  it("uses persisted precision and reports the persisted source", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      persistedFractionDigits: 2,
      timestamp: PRE_CUTOFF,
    })

    expect(result).toBe(2)
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "persisted",
        "payment.displayCurrencyFractionDigits": 2,
      }),
    )
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("honors a persisted zero scale", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      persistedFractionDigits: 0,
      timestamp: POST_CUTOFF,
    })

    expect(result).toBe(0)
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "persisted",
      }),
    )
  })

  it("uses the immutable legacy constant for a definitely pre-ICU 48 payment and records it", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: PRE_CUTOFF,
    })

    expect(result).toBe(2)
    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warn" }),
    )
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "legacyConstantFallback",
      }),
    )
  })

  it("uses the legacy constant regardless of the runtime ICU snapshot", () => {
    // CLDR 48 reports COP at 0 digits; a pre-cutoff row must still resolve to
    // the write-time scale. Under a Node 24 runtime the ICU fallback would
    // return 0, so this fails if the constant stops being used.
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-08-04T00:00:00Z"),
    })

    expect(result).toBe(2)
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "legacyConstantFallback",
      }),
    )
  })

  it("falls back to ICU for a post-cutoff row without persisted digits", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: POST_CUTOFF,
    })

    expect(result).toBe(getCurrencyMajorExponent(COP))
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "runtimeIcuFallback",
      }),
    )
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("falls back to ICU for a currency unchanged by CLDR 48 without recording an exception", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: "EUR" as DisplayCurrency,
      timestamp: PRE_CUTOFF,
    })

    expect(result).toBe(2)
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "runtimeIcuFallback",
      }),
    )
    expect(mockRecordException).not.toHaveBeenCalled()
  })
})
