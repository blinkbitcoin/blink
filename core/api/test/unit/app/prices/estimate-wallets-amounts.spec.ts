import { estimateWalletsAmounts } from "@/app/prices/estimate-wallets-amounts"
import { CacheKeys } from "@/domain/cache"
import { WalletCurrency } from "@/domain/shared"
import { LocalCacheService } from "@/services/cache/local-cache"
import { PriceService } from "@/services/price"

jest.mock("@/config", () => ({ RATIO_PRECISION: 1_000_000, SECS_PER_10_MINS: 600 }))
jest.mock("@/services/price", () => ({ PriceService: jest.fn() }))
jest.mock("@/services/tracing", () => ({
  /* eslint @typescript-eslint/ban-ts-comment: "off" */
  // @ts-ignore-next-line no-implicit-any error
  wrapAsyncFunctionsToRunInSpan: ({ fns }) => fns,
}))

const PKR = "PKR" as DisplayCurrency
const priceService = PriceService as jest.MockedFunction<typeof PriceService>

describe("estimateWalletsAmounts", () => {
  beforeEach(async () => {
    await Promise.all([
      LocalCacheService().clear({ key: CacheKeys.CurrentSatPrice }),
      LocalCacheService().clear({ key: CacheKeys.CurrentUsdCentPrice }),
      LocalCacheService().clear({ key: CacheKeys.PriceCurrencies }),
    ])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("preserves fractional major units when price metadata differs from ICU", async () => {
    priceService.mockReturnValue({
      listHistory: jest.fn(),
      listCurrencies: () =>
        Promise.resolve([
          {
            code: PKR,
            symbol: "₨",
            name: "Pakistani Rupee",
            flag: "🇵🇰",
            fractionDigits: 2,
            countryCodes: ["PK"],
          },
        ]),
      getSatRealTimePrice: () =>
        Promise.resolve({
          timestamp: new Date(),
          price: 0.2197,
          currency: PKR,
        }),
      getUsdCentRealTimePrice: () =>
        Promise.resolve({
          timestamp: new Date(),
          price: 2.197,
          currency: PKR,
        }),
    })

    const result = await estimateWalletsAmounts({ amount: 21.97, currency: PKR })
    if (result instanceof Error) throw result

    expect(result.btcSatAmount).toEqual({
      amount: 100n,
      currency: WalletCurrency.Btc,
    })
    expect(result.usdCentAmount).toEqual({
      amount: 10n,
      currency: WalletCurrency.Usd,
    })
  })
})
