import { Prices } from "@/app"
import RealtimePriceQuery from "@/graphql/public/root/query/realtime-price"

jest.mock("@/app", () => ({
  Prices: {
    getCurrency: jest.fn(),
    getCurrentSatPrice: jest.fn(),
    getCurrentUsdCentPrice: jest.fn(),
  },
}))
jest.mock("@/graphql/error-map", () => ({ mapError: jest.fn() }))
jest.mock("@/graphql/index", () => ({
  GT: {
    Field: (config: unknown) => config,
    NonNull: (type: unknown) => type,
  },
}))
jest.mock("@/graphql/public/types/object/realtime-price", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/display-currency", () => ({
  __esModule: true,
  default: {},
}))

const getCurrency = Prices.getCurrency as jest.MockedFunction<typeof Prices.getCurrency>
const getCurrentSatPrice = Prices.getCurrentSatPrice as jest.MockedFunction<
  typeof Prices.getCurrentSatPrice
>
const getCurrentUsdCentPrice = Prices.getCurrentUsdCentPrice as jest.MockedFunction<
  typeof Prices.getCurrentUsdCentPrice
>

describe("RealtimePriceQuery", () => {
  const resolve = RealtimePriceQuery.resolve
  if (!resolve) throw new Error("RealtimePriceQuery must define a resolver")

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    {
      currency: "PKR",
      fractionDigits: 2,
      expectedSatPrice: 0.123,
      expectedUsdCentPrice: 278,
    },
    {
      currency: "RSD",
      fractionDigits: 0,
      expectedSatPrice: 0.00123,
      expectedUsdCentPrice: 2.78,
    },
  ])(
    "scales $currency prices using the price-service fraction digits",
    async ({ currency, fractionDigits, expectedSatPrice, expectedUsdCentPrice }) => {
      const displayCurrency = currency as DisplayCurrency
      const timestamp = new Date()
      const priceCurrency = {
        code: displayCurrency,
        symbol: currency,
        name: currency,
        flag: "",
        fractionDigits,
        countryCodes: [],
      }

      getCurrency.mockResolvedValue(priceCurrency)
      getCurrentSatPrice.mockResolvedValue({
        timestamp,
        price: 0.00123,
        currency: displayCurrency,
      })
      getCurrentUsdCentPrice.mockResolvedValue({
        timestamp,
        price: 2.78,
        currency: displayCurrency,
      })

      const result = (await resolve(
        {},
        { currency: displayCurrency },
        {} as GraphQLPublicContext,
        {} as never,
      )) as {
        denominatorCurrencyDetails: PriceCurrency
        btcSatPrice: { base: number; offset: number }
        usdCentPrice: { base: number; offset: number }
      }

      expect(result.denominatorCurrencyDetails).toBe(priceCurrency)
      expect(result.btcSatPrice.base / 10 ** result.btcSatPrice.offset).toBe(
        expectedSatPrice,
      )
      expect(result.usdCentPrice.base / 10 ** result.usdCentPrice.offset).toBe(
        expectedUsdCentPrice,
      )
    },
  )
})
