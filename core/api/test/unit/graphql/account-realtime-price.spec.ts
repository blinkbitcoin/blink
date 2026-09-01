import { Prices } from "@/app"
import BusinessAccount from "@/graphql/public/types/object/business-account"
import ConsumerAccount from "@/graphql/public/types/object/consumer-account"

jest.mock("@/app", () => ({
  Accounts: {},
  Prices: {
    getCurrency: jest.fn(),
    getCurrentSatPrice: jest.fn(),
    getCurrentUsdCentPrice: jest.fn(),
  },
  Quiz: {},
  Wallets: {},
}))
jest.mock("@/app/callback", () => ({
  getPortalUrl: jest.fn(),
  listEndpoints: jest.fn(),
}))
jest.mock("@/graphql/index", () => ({
  GT: {
    String: {},
    NonNullID: {},
    Object: (config: unknown) => config,
    NonNull: (type: unknown) => type,
    NonNullList: (type: unknown) => type,
    List: (type: unknown) => type,
  },
}))
jest.mock("@/graphql/error-map", () => ({ mapError: jest.fn() }))
jest.mock("@/graphql/connections", () => ({ connectionArgs: {} }))
jest.mock("@/graphql/public/types/abstract/account", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/abstract/wallet", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/wallet-id", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/display-currency", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/scalar/account-level", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/object/transaction", () => ({
  __esModule: true,
  default: {},
  TransactionConnection: {},
}))
jest.mock("@/graphql/public/types/object/realtime-price", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/object/notification-settings", () => ({
  NotificationSettings: {},
}))
jest.mock("@/graphql/public/types/object/public-wallet", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/shared/types/abstract/invoice", () => ({
  IInvoiceConnection: {},
}))
jest.mock("@/graphql/public/types/object/account-limits", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/object/quiz", () => ({
  __esModule: true,
  default: {},
}))
jest.mock("@/graphql/public/types/object/callback-endpoint", () => ({
  __esModule: true,
  default: {},
}))

type AccountObjectConfig = {
  fields: () => {
    realtimePrice: {
      resolve: (source: Account) => Promise<{
        btcSatPrice: { base: number; offset: number }
        usdCentPrice: { base: number; offset: number }
      }>
    }
  }
}

const getRealtimePriceResolver = (accountObject: unknown) =>
  (accountObject as AccountObjectConfig).fields().realtimePrice.resolve

describe("account realtimePrice fields", () => {
  const getCurrency = Prices.getCurrency as jest.MockedFunction<typeof Prices.getCurrency>
  const getCurrentSatPrice = Prices.getCurrentSatPrice as jest.MockedFunction<
    typeof Prices.getCurrentSatPrice
  >
  const getCurrentUsdCentPrice = Prices.getCurrentUsdCentPrice as jest.MockedFunction<
    typeof Prices.getCurrentUsdCentPrice
  >

  beforeEach(() => {
    const currency = "PKR" as DisplayCurrency
    getCurrency.mockResolvedValue({
      code: currency,
      symbol: "₨",
      name: "Pakistani Rupee",
      flag: "🇵🇰",
      fractionDigits: 2,
      countryCodes: ["PK"],
    })
    getCurrentSatPrice.mockResolvedValue({
      timestamp: new Date(),
      price: 0.2197,
      currency,
    })
    getCurrentUsdCentPrice.mockResolvedValue({
      timestamp: new Date(),
      price: 2.78,
      currency,
    })
  })

  it.each([
    ["business", BusinessAccount],
    ["consumer", ConsumerAccount],
  ])("scales the %s account price with price-service precision", async (_, object) => {
    const result = await getRealtimePriceResolver(object)({
      displayCurrency: "PKR" as DisplayCurrency,
    } as Account)

    expect(result.btcSatPrice.base / 10 ** result.btcSatPrice.offset).toBe(21.97)
    expect(result.usdCentPrice.base / 10 ** result.usdCentPrice.offset).toBe(278)
  })
})
