import { Prices } from "@/app"
import PriceSubscription from "@/graphql/public/root/subscription/price"
import { PRICE_DEPRECATED_MESSAGE } from "@/graphql/public/root/subscription/deprecated-price"

type PublishArgs = { trigger: string; payload: unknown }
type IteratorArgs = { trigger: string | string[] }

const mockPublishDelayed = jest.fn<void, [PublishArgs]>()
const mockCreateAsyncIterator = jest.fn<string, [IteratorArgs]>(() => "async-iterator")

jest.mock("@/app", () => ({
  Prices: {
    listCurrencies: jest.fn(),
    getCurrentSatPrice: jest.fn(),
  },
}))
jest.mock("@/domain/pubsub", () => ({
  // Return a real trigger string so tests can assert *which* triggers are subscribed to.
  customPubSubTrigger: ({ event, suffix }: { event: string; suffix: string }) =>
    `${event}:${suffix}`,
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
jest.mock("@/services/pubsub", () => ({
  // Delegate lazily: `price.ts` calls PubSubService() at import time, before the
  // mock fns above are initialised.
  PubSubService: () => ({
    publishDelayed: (args: PublishArgs) => mockPublishDelayed(args),
    createAsyncIterator: (args: IteratorArgs) => mockCreateAsyncIterator(args),
  }),
}))

const listCurrencies = Prices.listCurrencies as jest.MockedFunction<
  typeof Prices.listCurrencies
>
const getCurrentSatPrice = Prices.getCurrentSatPrice as jest.MockedFunction<
  typeof Prices.getCurrentSatPrice
>

const currencyOf = (code: string, fractionDigits = 2) => ({
  code: code as DisplayCurrency,
  symbol: code,
  name: code,
  flag: "",
  fractionDigits,
  countryCodes: [],
})

const usdInput = {
  amount: 100,
  amountCurrencyUnit: "BTCSAT",
  priceCurrencyUnit: "USDCENT",
}

const publishedPayloads = () =>
  mockPublishDelayed.mock.calls.map(([args]) => args.payload)
const subscribedTriggers = () =>
  mockCreateAsyncIterator.mock.calls.flatMap(([args]) => [args.trigger].flat())

describe("PriceSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("resolve", () => {
    it("keeps the deprecated USD-only payload denominated in cents", () => {
      const result = PriceSubscription.resolve(
        { pricePerSat: 0.2197, displayCurrency: "USD" as DisplayCurrency },
        { input: usdInput },
      )

      // Pinned exactly: `base`/`offset` are the fields the client divides to recover the
      // price, so an assertion that skips them would let a precision regression through.
      expect(result).toEqual({
        errors: [],
        price: {
          formattedAmount: "2197",
          base: 2197000000000000,
          offset: 12,
          currencyUnit: "USDCENT",
        },
      })
    })

    it("rejects a non-USD payload reaching the price subscription resolver", () => {
      const result = PriceSubscription.resolve(
        { pricePerSat: 0.2197, displayCurrency: "PKR" as DisplayCurrency },
        { input: { ...usdInput, priceCurrencyUnit: "PKRCENT" } },
      )

      expect(result).toEqual({ errors: [{ message: PRICE_DEPRECATED_MESSAGE }] })
    })

    it("surfaces upstream errors ahead of the price payload", () => {
      const result = PriceSubscription.resolve(
        { errors: [{ message: "Unsupported exchange unit", path: undefined }] },
        { input: usdInput },
      )

      expect(result).toEqual({ errors: [{ message: "Unsupported exchange unit" }] })
    })

    it("treats an empty error list as no error and still resolves the price", () => {
      const result = PriceSubscription.resolve(
        { errors: [], pricePerSat: 0.2197, displayCurrency: "USD" as DisplayCurrency },
        { input: usdInput },
      )

      expect(result).toMatchObject({ price: { formattedAmount: "2197" } })
    })

    it("reports missing price info when the payload carries no price", () => {
      const result = PriceSubscription.resolve(
        { displayCurrency: "USD" as DisplayCurrency },
        { input: usdInput },
      )

      expect(result).toEqual({ errors: [{ message: "No price info" }] })
    })

    it("throws when the payload is undefined", () => {
      expect(() => PriceSubscription.resolve(undefined, { input: usdInput })).toThrow()
    })
  })

  describe("subscribe", () => {
    beforeEach(() => {
      listCurrencies.mockResolvedValue([currencyOf("USD"), currencyOf("PKR")])
      getCurrentSatPrice.mockResolvedValue({
        timestamp: new Date(),
        price: 0.2197,
        currency: "USD" as DisplayCurrency,
      })
    })

    it("subscribes a USD unit to the recurring price trigger", async () => {
      await PriceSubscription.subscribe(undefined, { input: usdInput })

      expect(publishedPayloads()).toEqual([
        { pricePerSat: 0.2197, displayCurrency: "USD" },
      ])
      expect(subscribedTriggers()).toContain("price-update:USD")
    })

    it("rejects a non-USD unit once instead of attaching the recurring price trigger", async () => {
      await PriceSubscription.subscribe(undefined, {
        input: { ...usdInput, priceCurrencyUnit: "PKRCENT" },
      })

      // One error frame at subscribe time...
      expect(publishedPayloads()).toEqual([
        { errors: [{ message: PRICE_DEPRECATED_MESSAGE }] },
      ])
      // ...and no subscription to `price-update:PKR`, which the trigger server publishes
      // to every 30s and would otherwise turn into an endless stream of the same error.
      expect(subscribedTriggers()).not.toContain("price-update:PKR")
      expect(subscribedTriggers()).toHaveLength(1)
      expect(getCurrentSatPrice).not.toHaveBeenCalled()
    })

    it("rejects an unsupported amount currency unit before the deprecation check", async () => {
      await PriceSubscription.subscribe(undefined, {
        input: { ...usdInput, amountCurrencyUnit: "BTCMSAT" },
      })

      expect(publishedPayloads()).toEqual([
        { errors: [{ message: "Unsupported exchange unit" }] },
      ])
    })

    it("rejects an amount beyond the SafeInt limit", async () => {
      await PriceSubscription.subscribe(undefined, {
        input: { ...usdInput, amount: 1000000 },
      })

      expect(publishedPayloads()).toEqual([
        { errors: [{ message: "Unsupported exchange amount" }] },
      ])
    })
  })
})
