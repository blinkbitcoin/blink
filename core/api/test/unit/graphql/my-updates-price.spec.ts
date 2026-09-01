import MyUpdatesSubscription from "@/graphql/public/root/subscription/my-updates"

jest.mock("@/app", () => ({
  Prices: {
    getCurrency: jest.fn(),
    getCurrentSatPrice: jest.fn(),
    getCurrentUsdCentPrice: jest.fn(),
  },
}))
jest.mock("@/domain/pubsub", () => ({
  customPubSubTrigger: jest.fn(),
  PubSubDefaultTriggers: {
    AccountUpdate: "account-update",
    UserPriceUpdate: "user-price-update",
  },
}))
jest.mock("@/graphql/index", () => ({
  GT: {
    Float: {},
    Object: (config: unknown) => config,
    Union: (config: unknown) => config,
    NonNull: (type: unknown) => type,
    NonNullList: (type: unknown) => type,
  },
}))
jest.mock("@/graphql/error", () => ({
  AuthenticationError: Error,
  UnknownClientError: Error,
}))
jest.mock("@/services/logger", () => ({ baseLogger: {} }))
jest.mock("@/services/pubsub", () => ({ PubSubService: () => ({}) }))
jest.mock("@/graphql/public/types/object/price", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/abstract/error", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/wallet-id", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/sat-amount", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/object/user", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/object/transaction", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/payment-hash", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/object/realtime-price", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/onchain-tx-hash", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/scalar/tx-notification-type", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/invoice-payment-status", () => ({
  __esModule: true,
  default: {},
}))

describe("MyUpdatesSubscription price events", () => {
  const priceCurrency = {
    code: "PKR" as DisplayCurrency,
    symbol: "₨",
    name: "Pakistani Rupee",
    flag: "🇵🇰",
    fractionDigits: 2,
    countryCodes: ["PK"],
  }

  it("preserves the USD-cent contract for the deprecated USD event", () => {
    const result = MyUpdatesSubscription.resolve(
      {
        errors: undefined as never,
        price: {
          timestamp: new Date(),
          pricePerSat: 0.1234,
          pricePerUsdCent: 0,
          currency: {
            ...priceCurrency,
            code: "USD" as DisplayCurrency,
            fractionDigits: 3,
          },
          displayCurrency: "USD" as DisplayCurrency,
        },
      },
      {},
      {} as GraphQLPublicContext,
    ) as { update: Record<string, unknown> }

    expect(result.update).toMatchObject({
      resolveType: "Price",
      base: 12340000000000,
      formattedAmount: "12.34",
      currencyUnit: "USDCENT",
    })
  })

  it("rejects non-USD deprecated price events", () => {
    const result = MyUpdatesSubscription.resolve(
      {
        errors: undefined as never,
        price: {
          timestamp: new Date(),
          pricePerSat: 0.2197,
          pricePerUsdCent: 0,
          currency: priceCurrency,
          displayCurrency: priceCurrency.code,
        },
      },
      {},
      {} as GraphQLPublicContext,
    )

    expect(result).toEqual({
      errors: [{ message: "Price is deprecated, please use realtimePrice event" }],
    })
  })

  it("uses published currency metadata for realtime price events", () => {
    const result = MyUpdatesSubscription.resolve(
      {
        errors: undefined as never,
        realtimePrice: {
          timestamp: new Date(),
          pricePerSat: 0.2197,
          pricePerUsdCent: 2.78,
          currency: priceCurrency,
          displayCurrency: priceCurrency.code,
        },
      },
      {},
      { domainAccount: {} } as GraphQLPublicContextAuth,
    ) as { update: Record<string, unknown> }

    expect(result.update).toMatchObject({
      resolveType: "RealtimePrice",
      denominatorCurrency: "PKR",
      btcSatPrice: { base: 21970000000000, offset: 12, currencyUnit: "MINOR" },
      usdCentPrice: { base: 278000000, offset: 6, currencyUnit: "MINOR" },
    })
  })
})
