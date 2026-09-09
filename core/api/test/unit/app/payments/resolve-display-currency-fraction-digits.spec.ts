import { resolvePaymentDisplayCurrencyFractionDigits } from "@/app/payments/resolve-display-currency-fraction-digits"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import { addAttributesToCurrentSpan } from "@/services/tracing"

jest.mock("@/services/tracing", () => ({ addAttributesToCurrentSpan: jest.fn() }))

const mockAddAttributes = addAttributesToCurrentSpan as jest.Mock
const logger = { warn: jest.fn() } as unknown as Logger
const COP = "COP" as DisplayCurrency

afterEach(() => jest.clearAllMocks())

describe("resolvePaymentDisplayCurrencyFractionDigits", () => {
  it("uses persisted precision without a fallback", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      persistedFractionDigits: 2,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(2)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("uses the immutable legacy constant for a definitely pre-ICU 48 payment", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "legacyConstantFallback" }),
      "using fallback display precision for payment without persisted scale",
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
      logger,
    })

    expect(result).toBe(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "legacyConstantFallback" }),
      "using fallback display precision for payment without persisted scale",
    )
  })

  it("falls back to ICU for a post-cutoff row without persisted digits", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-09-01T00:00:00Z"),
      logger,
    })

    const fallbackFractionDigits = getCurrencyMajorExponent(COP)
    expect(result).toBe(fallbackFractionDigits)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackFractionDigits, source: "runtimeIcuFallback" }),
      "using fallback display precision for payment without persisted scale",
    )
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "runtimeIcuFallback",
      }),
    )
  })

  it("falls back to ICU for a currency unchanged by CLDR 48", () => {
    const result = resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: "EUR" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "runtimeIcuFallback" }),
      "using fallback display precision for payment without persisted scale",
    )
  })
})
