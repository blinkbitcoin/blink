import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import { listCachedPriceCurrencies } from "@/services/price/list-currencies"
import {
  InvalidPriceCurrencyError,
  PriceCurrenciesNotAvailableError,
} from "@/domain/price"

jest.mock("@/services/price/list-currencies", () => ({
  listCachedPriceCurrencies: jest.fn(),
}))

const mockListCachedPriceCurrencies = listCachedPriceCurrencies as jest.MockedFunction<
  typeof listCachedPriceCurrencies
>

afterEach(() => {
  jest.resetAllMocks()
})

describe("getCurrencyFractionDigits", () => {
  it("uses an explicit override without querying the price service", async () => {
    const fractionDigits = await getCurrencyFractionDigits({
      currency: "COP" as DisplayCurrency,
      fractionDigits: 2,
    })

    expect(fractionDigits).toBe(2)
    expect(mockListCachedPriceCurrencies).not.toHaveBeenCalled()
  })

  it.each([-1, 5, 1.5])("rejects invalid explicit fraction digits: %s", async (value) => {
    const result = await getCurrencyFractionDigits({
      currency: "COP" as DisplayCurrency,
      fractionDigits: value,
    })

    expect(result).toBeInstanceOf(InvalidPriceCurrencyError)
    expect(mockListCachedPriceCurrencies).not.toHaveBeenCalled()
  })

  it("uses the fraction digits published by the price service", async () => {
    mockListCachedPriceCurrencies.mockResolvedValueOnce([
      {
        code: "COP" as DisplayCurrency,
        symbol: "$",
        name: "Colombian Peso",
        flag: "🇨🇴",
        fractionDigits: 2,
        countryCodes: ["CO"],
      },
    ])

    const fractionDigits = await getCurrencyFractionDigits({
      currency: "COP" as DisplayCurrency,
    })

    expect(fractionDigits).toBe(2)
  })

  it("returns the service error when currencies are unavailable", async () => {
    const error = new PriceCurrenciesNotAvailableError()
    mockListCachedPriceCurrencies.mockResolvedValueOnce(error)

    const fractionDigits = await getCurrencyFractionDigits({
      currency: "XYZ" as DisplayCurrency,
    })

    expect(fractionDigits).toBe(error)
  })

  it("returns an error when the currency is missing", async () => {
    mockListCachedPriceCurrencies.mockResolvedValueOnce([])

    const fractionDigits = await getCurrencyFractionDigits({
      currency: "XYZ" as DisplayCurrency,
    })

    expect(fractionDigits).toBeInstanceOf(InvalidPriceCurrencyError)
  })

  it("rejects invalid price-service fraction digits", async () => {
    mockListCachedPriceCurrencies.mockResolvedValueOnce([
      {
        code: "COP" as DisplayCurrency,
        symbol: "$",
        name: "Colombian Peso",
        flag: "🇨🇴",
        fractionDigits: -1,
        countryCodes: ["CO"],
      },
    ])

    const result = await getCurrencyFractionDigits({
      currency: "COP" as DisplayCurrency,
    })

    expect(result).toBeInstanceOf(InvalidPriceCurrencyError)
  })
})
