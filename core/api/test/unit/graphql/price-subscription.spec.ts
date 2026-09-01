import PriceSubscription from "@/graphql/public/root/subscription/price"

jest.mock("@/app", () => ({
  Prices: {
    listCurrencies: jest.fn(),
    getCurrentSatPrice: jest.fn(),
  },
}))
jest.mock("@/domain/pubsub", () => ({
  customPubSubTrigger: jest.fn(),
  PubSubDefaultTriggers: { PriceUpdate: "price-update" },
}))
jest.mock("@/graphql/index", () => ({
  GT: {
    Input: (config: unknown) => config,
    NonNull: (type: unknown) => type,
  },
}))
jest.mock("@/graphql/error", () => ({ UnknownClientError: Error }))
jest.mock("@/graphql/public/types/payload/price", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/sat-amount", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/scalar/exchange-currency-unit", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/services/logger", () => ({ baseLogger: {} }))
jest.mock("@/services/pubsub", () => ({ PubSubService: () => ({}) }))

describe("PriceSubscription", () => {
  it("keeps the deprecated USD-only payload denominated in cents", () => {
    const result = PriceSubscription.resolve(
      {
        errors: undefined as never,
        pricePerSat: 0.2197,
        displayCurrency: "USD" as DisplayCurrency,
      },
      {
        input: {
          amount: 100,
          amountCurrencyUnit: "BTCSAT",
          priceCurrencyUnit: "USDCENT",
        },
      },
    )

    expect(result).toMatchObject({
      errors: [],
      price: {
        formattedAmount: "2197",
        currencyUnit: "USDCENT",
      },
    })
  })

  it("rejects non-USD deprecated price events", () => {
    const result = PriceSubscription.resolve(
      {
        errors: undefined as never,
        pricePerSat: 0.2197,
        displayCurrency: "PKR" as DisplayCurrency,
      },
      {
        input: {
          amount: 100,
          amountCurrencyUnit: "BTCSAT",
          priceCurrencyUnit: "USDCENT",
        },
      },
    )

    expect(result).toEqual({
      errors: [{ message: "Price is deprecated, please use realtimePrice event" }],
    })
  })
})
