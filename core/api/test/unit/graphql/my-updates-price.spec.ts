import { Prices } from "@/app"
import MyUpdatesSubscription from "@/graphql/public/root/subscription/my-updates"
import { PRICE_DEPRECATED_MESSAGE } from "@/graphql/public/root/subscription/deprecated-price"

type PublishArgs = { trigger: string; payload: unknown }
type IteratorArgs = { trigger: string | string[] }

const mockPublishDelayed = jest.fn<void, [PublishArgs]>()
const mockCreateAsyncIterator = jest.fn<string, [IteratorArgs]>(() => "async-iterator")

jest.mock("@/app", () => ({
  Prices: {
    getCurrency: jest.fn(),
    getCurrentSatPrice: jest.fn(),
    getCurrentUsdCentPrice: jest.fn(),
  },
}))
jest.mock("@/domain/pubsub", () => ({
  // Return a real trigger string so tests can assert *which* triggers are subscribed to.
  customPubSubTrigger: ({ event, suffix }: { event: string; suffix: string }) =>
    `${event}:${suffix}`,
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
jest.mock("@/services/pubsub", () => ({
  // Delegate lazily: `my-updates.ts` calls PubSubService() at import time, before the
  // mock fns above are initialised.
  PubSubService: () => ({
    publishDelayed: (args: PublishArgs) => mockPublishDelayed(args),
    createAsyncIterator: (args: IteratorArgs) => mockCreateAsyncIterator(args),
  }),
}))
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

const getCurrency = Prices.getCurrency as jest.MockedFunction<typeof Prices.getCurrency>
const getCurrentSatPrice = Prices.getCurrentSatPrice as jest.MockedFunction<
  typeof Prices.getCurrentSatPrice
>
const getCurrentUsdCentPrice = Prices.getCurrentUsdCentPrice as jest.MockedFunction<
  typeof Prices.getCurrentUsdCentPrice
>

const TIMESTAMP = new Date("2026-09-01T00:00:00.000Z")

const currencyOf = (code: string, fractionDigits = 2): PriceCurrency => ({
  code: code as DisplayCurrency,
  symbol: code,
  name: code,
  flag: "",
  fractionDigits,
  countryCodes: [],
})

// One factory for every price event, so each test's overrides show exactly which field
// drives the assertion.
const priceEvent = (overrides: Partial<ReturnType<typeof basePriceEvent>> = {}) => ({
  ...basePriceEvent(),
  ...overrides,
})

function basePriceEvent() {
  return {
    timestamp: TIMESTAMP,
    pricePerSat: 0.2197,
    pricePerUsdCent: 2.78,
    currency: currencyOf("PKR"),
    displayCurrency: "PKR" as DisplayCurrency,
  }
}

const authedCtx = { domainAccount: {} } as GraphQLPublicContextAuth
const anonCtx = {} as GraphQLPublicContext

const publishedPayloads = () =>
  mockPublishDelayed.mock.calls.map(([args]) => args.payload)

describe("MyUpdatesSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("deprecated price events", () => {
    it("preserves the USD-cent contract for the deprecated USD event", () => {
      const result = MyUpdatesSubscription.resolve(
        {
          // fractionDigits deliberately disagrees with USD: the deprecated branch must
          // stay pinned to MajorExponent.STANDARD, not follow the currency metadata.
          price: priceEvent({
            pricePerSat: 0.1234,
            currency: currencyOf("USD", 3),
            displayCurrency: "USD" as DisplayCurrency,
          }),
        },
        {},
        anonCtx,
      )

      expect(result).toEqual({
        errors: [],
        me: null,
        update: {
          resolveType: "Price",
          base: 12340000000000,
          offset: 12,
          currencyUnit: "USDCENT",
          formattedAmount: "12.34",
        },
      })
    })

    it("rejects a non-USD payload reaching the myUpdates price branch", () => {
      // Only `displayCurrency` drives this: the guard is the first statement inside the
      // `source.price` branch, so no other field on the event is read.
      const result = MyUpdatesSubscription.resolve(
        { price: priceEvent({ displayCurrency: "PKR" as DisplayCurrency }) },
        {},
        anonCtx,
      )

      expect(result).toEqual({ errors: [{ message: PRICE_DEPRECATED_MESSAGE }] })
    })

    it("resolves the deprecated price without authentication", () => {
      const result = MyUpdatesSubscription.resolve(
        { price: priceEvent({ displayCurrency: "USD" as DisplayCurrency }) },
        {},
        anonCtx,
      )

      // The price branch deliberately returns before the auth check; pinning it here so
      // reordering the guards cannot silently make this subscription authed-only.
      expect(result).toMatchObject({ me: null })
    })
  })

  describe("realtime price events", () => {
    it.each([
      {
        currency: "PKR",
        fractionDigits: 2,
        expectedSatBase: 21970000000000,
        expectedUsdCentBase: 278000000,
      },
      {
        currency: "RSD",
        fractionDigits: 0,
        expectedSatBase: 219700000000,
        expectedUsdCentBase: 2780000,
      },
    ])(
      "scales $currency events using the published currency metadata",
      ({ currency, fractionDigits, expectedSatBase, expectedUsdCentBase }) => {
        const priceCurrency = currencyOf(currency, fractionDigits)

        const result = MyUpdatesSubscription.resolve(
          {
            realtimePrice: priceEvent({
              currency: priceCurrency,
              displayCurrency: priceCurrency.code,
            }),
          },
          {},
          authedCtx,
        )

        expect(result).toEqual({
          errors: [],
          me: {},
          update: {
            resolveType: "RealtimePrice",
            timestamp: TIMESTAMP,
            denominatorCurrencyDetails: priceCurrency,
            denominatorCurrency: currency,
            btcSatPrice: { base: expectedSatBase, offset: 12, currencyUnit: "MINOR" },
            usdCentPrice: { base: expectedUsdCentBase, offset: 6, currencyUnit: "MINOR" },
          },
        })
      },
    )

    it("throws for an unauthenticated realtime price event", () => {
      expect(() =>
        MyUpdatesSubscription.resolve({ realtimePrice: priceEvent() }, {}, anonCtx),
      ).toThrow()
    })
  })

  describe("resolve guards", () => {
    it("surfaces upstream errors ahead of every payload branch", () => {
      const result = MyUpdatesSubscription.resolve(
        { errors: [{ message: "boom", path: undefined }], price: priceEvent() },
        {},
        anonCtx,
      )

      expect(result).toEqual({ errors: [{ message: "boom", path: undefined }] })
    })

    it("treats an empty error list as no error and still resolves the price", () => {
      const result = MyUpdatesSubscription.resolve(
        {
          errors: [],
          price: priceEvent({ displayCurrency: "USD" as DisplayCurrency }),
        },
        {},
        anonCtx,
      )

      expect(result).toMatchObject({ update: { resolveType: "Price" } })
    })

    it("throws when the payload is undefined", () => {
      expect(() => MyUpdatesSubscription.resolve(undefined, {}, anonCtx)).toThrow()
    })

    it("returns undefined for a payload with no recognised branch", () => {
      expect(MyUpdatesSubscription.resolve({}, {}, authedCtx)).toBeUndefined()
    })
  })

  describe("subscribe", () => {
    beforeEach(() => {
      getCurrentSatPrice.mockResolvedValue({
        timestamp: TIMESTAMP,
        price: 0.2197,
        currency: "PKR" as DisplayCurrency,
      })
      getCurrentUsdCentPrice.mockResolvedValue({
        timestamp: TIMESTAMP,
        price: 2.78,
        currency: "PKR" as DisplayCurrency,
      })
    })

    const subscribeAs = async (displayCurrency: string) => {
      getCurrency.mockResolvedValue(currencyOf(displayCurrency))
      await MyUpdatesSubscription.subscribe({}, {}, {
        domainAccount: { id: "account-id", displayCurrency },
      } as GraphQLPublicContextAuth)
    }

    it("publishes both the deprecated price and the realtime price for USD", async () => {
      await subscribeAs("USD")

      expect(publishedPayloads().map((p) => Object.keys(p as object)[0])).toEqual([
        "price",
        "realtimePrice",
      ])
    })

    it("publishes only the realtime price for a non-USD account", async () => {
      await subscribeAs("PKR")

      // This is the gate that actually keeps non-USD clients off the deprecated event —
      // the resolver guard above it is unreachable while this holds.
      expect(publishedPayloads().map((p) => Object.keys(p as object)[0])).toEqual([
        "realtimePrice",
      ])
    })
  })
})
