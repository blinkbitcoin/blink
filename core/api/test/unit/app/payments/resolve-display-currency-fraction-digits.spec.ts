import { resolvePaymentDisplayCurrencyFractionDigits } from "@/app/payments/resolve-display-currency-fraction-digits"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import { PriceCurrenciesNotAvailableError } from "@/domain/price"
import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import { addAttributesToCurrentSpan } from "@/services/tracing"

jest.mock("@/services/price/get-currency-fraction-digits", () => ({
  getCurrencyFractionDigits: jest.fn(),
}))
jest.mock("@/services/tracing", () => ({ addAttributesToCurrentSpan: jest.fn() }))

const mockGetCurrencyFractionDigits = getCurrencyFractionDigits as jest.MockedFunction<
  typeof getCurrencyFractionDigits
>
const mockAddAttributes = addAttributesToCurrentSpan as jest.Mock
const logger = { warn: jest.fn() } as unknown as Logger
const COP = "COP" as DisplayCurrency

afterEach(() => jest.clearAllMocks())

describe("resolvePaymentDisplayCurrencyFractionDigits", () => {
  it("uses persisted precision without a fallback", async () => {
    const result = await resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      persistedFractionDigits: 2,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(2)
    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("uses price metadata for a definitely pre-Node 24 payment", async () => {
    mockGetCurrencyFractionDigits.mockResolvedValueOnce(2)

    const result = await resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "priceMetadataLegacyFallback" }),
      "using fallback precision for legacy payment",
    )
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "priceMetadataLegacyFallback",
      }),
    )
  })

  it("falls back to ICU when legacy price metadata is unavailable", async () => {
    mockGetCurrencyFractionDigits.mockResolvedValueOnce(
      new PriceCurrenciesNotAvailableError(),
    )

    const result = await resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    expect(result).toBe(getCurrencyMajorExponent(COP))
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "runtimeIcuFallback" }),
      "using fallback precision for legacy payment",
    )
  })

  it("falls back to ICU when the legacy price lookup throws", async () => {
    const error = new Error("price lookup failed")
    mockGetCurrencyFractionDigits.mockRejectedValueOnce(error)

    const result = await resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-07-03T00:00:00Z"),
      logger,
    })

    const fallbackFractionDigits = getCurrencyMajorExponent(COP)
    expect(result).toBe(fallbackFractionDigits)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error,
        fallbackFractionDigits,
        source: "runtimeIcuFallback",
      }),
      "using fallback precision for legacy payment",
    )
    expect(mockAddAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "payment.displayCurrencyFractionDigitsSource": "runtimeIcuFallback",
      }),
    )
  })

  it("does not reinterpret an ambiguous post-release payment", async () => {
    const result = await resolvePaymentDisplayCurrencyFractionDigits({
      displayCurrency: COP,
      timestamp: new Date("2026-08-04T00:00:00Z"),
      logger,
    })

    expect(result).toBe(getCurrencyMajorExponent(COP))
    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ source: "runtimeIcuFallback" }),
      "using fallback precision for legacy payment",
    )
  })
})
