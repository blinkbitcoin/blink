jest.mock("@/services/cache", () => ({
  RedisCacheService: jest.fn(),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
}))

import MockAdapter from "axios-mock-adapter"

import { IpFetcher, client } from "@/services/ipfetcher"

import { CacheUndefinedError } from "@/domain/cache"
import { UnresolvedIpFetcherServiceError } from "@/domain/ipfetcher"
import { RateLimiterExceededError } from "@/domain/rate-limit/errors"
import { RedisCacheService } from "@/services/cache"
import { consumeLimiter } from "@/services/rate-limit"

const mockRedisCacheService = RedisCacheService as jest.MockedFunction<
  typeof RedisCacheService
>
const mockConsumeLimiter = consumeLimiter as jest.MockedFunction<typeof consumeLimiter>

const mockCacheGet = jest.fn()
const mockCacheSet = jest.fn()

/* eslint @typescript-eslint/ban-ts-comment: "off" */
// @ts-ignore-next-line no-implicit-any error
let mock

beforeAll(() => {
  mock = new MockAdapter(client)
})

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisCacheService.mockReturnValue({
    get: mockCacheGet,
    set: mockCacheSet,
  } as unknown as ReturnType<typeof RedisCacheService>)
  mockCacheGet.mockResolvedValue(new CacheUndefinedError())
  mockCacheSet.mockResolvedValue(undefined)
  mockConsumeLimiter.mockResolvedValue(true)
})

afterEach(() => {
  // @ts-ignore-next-line no-implicit-any error
  mock.reset()
})

describe("IpFetcher - fetchIPInfo (login path)", () => {
  const ip = "152.231.190.229" as IpAddress

  it("returns proxy false when proxy is no", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))

    const ipInfo = await IpFetcher().fetchIPInfo(ip)
    expect(ipInfo).toEqual(
      expect.objectContaining({
        proxy: false,
        status: "ok",
      }),
    )
  })

  it("returns proxy true when proxy is yes", async () => {
    const data = getIpInfo(ip)
    // @ts-ignore-next-line no-implicit-any error
    data[ip]["proxy"] = "yes"

    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, data)

    const ipInfo = await IpFetcher().fetchIPInfo(ip)
    expect(ipInfo).toEqual(
      expect.objectContaining({
        proxy: true,
        status: "ok",
      }),
    )
  })

  it("returns proxy false when proxy is undefined", async () => {
    const data = getIpInfo(ip)

    // @ts-ignore-next-line no-implicit-any error
    delete data[ip]["proxy"]

    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, data)

    const ipInfo = await IpFetcher().fetchIPInfo(ip)
    expect(ipInfo).toEqual(
      expect.objectContaining({
        proxy: false,
        status: "ok",
      }),
    )
  })

  it("passes a denied answer through for the caller to authorize", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, { status: "denied" })

    const ipInfo = await IpFetcher().fetchIPInfo(ip)
    expect(ipInfo).toEqual(
      expect.objectContaining({
        proxy: false,
        status: "denied",
      }),
    )
    expect(ipInfo).not.toBeInstanceOf(Error)
  })

  it("passes a degraded answer with a country through untouched", async () => {
    const data = { ...getIpInfo(ip), status: "warning" }
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, data)

    const ipInfo = await IpFetcher().fetchIPInfo(ip)
    expect(ipInfo).toEqual(
      expect.objectContaining({
        isoCode: "CR",
        status: "warning",
      }),
    )
  })

  it("never touches the cache or the budget", async () => {
    mockCacheGet.mockResolvedValue({ isoCode: "CR", proxy: false })
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))

    const ipInfo = await IpFetcher().fetchIPInfo(ip)

    expect(ipInfo).toEqual(expect.objectContaining({ isoCode: "CR", status: "ok" }))
    expect(mockCacheGet).not.toHaveBeenCalled()
    expect(mockCacheSet).not.toHaveBeenCalled()
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    // @ts-ignore-next-line no-implicit-any error
    expect(mock.history.get).toHaveLength(1)
  })
})

describe("IpFetcher - region check caching", () => {
  const ip = "152.231.190.229" as IpAddress

  it("serves a cache hit without calling the provider", async () => {
    mockCacheGet.mockResolvedValue({ isoCode: "CR", proxy: false })
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(500)

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toEqual({ isoCode: "CR", proxy: false })
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it("caches a resolved answer", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))

    await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.objectContaining({ key: `ipfetcher:info:${ip}` }),
    )
  })

  it("never caches a provider failure", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(500)

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toBeInstanceOf(Error)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it("treats a denied answer as unresolved and never caches it", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, { status: "denied" })

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toBeInstanceOf(UnresolvedIpFetcherServiceError)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it("re-hits the vendor on the call after a denied answer", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, { status: "denied" })

    await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    // @ts-ignore-next-line no-implicit-any error
    mock.resetHistory()

    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))
    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)

    expect(ipInfo).toEqual(expect.objectContaining({ isoCode: "CR" }))
    // @ts-ignore-next-line no-implicit-any error
    expect(mock.history.get).toHaveLength(1)
  })

  it("treats a degraded answer with a country as unresolved and never caches it", async () => {
    const data = { ...getIpInfo(ip), status: "warning" }
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, data)

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toBeInstanceOf(UnresolvedIpFetcherServiceError)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })

  it("treats an ok answer with no country as unresolved", async () => {
    const data = getIpInfo(ip)
    // @ts-ignore-next-line no-implicit-any error
    delete data[ip]["isocode"]

    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, data)

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toBeInstanceOf(UnresolvedIpFetcherServiceError)
    expect(mockCacheSet).not.toHaveBeenCalled()
  })
})

describe("IpFetcher - region check budget", () => {
  const ip = "152.231.190.229" as IpAddress

  it("consumes the global budget once per uncached region check lookup", async () => {
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))

    await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)

    const keys = mockConsumeLimiter.mock.calls.map(([{ keyToConsume }]) => keyToConsume)
    expect(keys).toEqual([""])
  })

  it("consumes no budget on a region check cache hit", async () => {
    mockCacheGet.mockResolvedValue({ isoCode: "CR", proxy: false })

    await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
  })

  it("short-circuits without calling the provider when the budget is spent", async () => {
    mockConsumeLimiter.mockResolvedValue(new RateLimiterExceededError())
    // @ts-ignore-next-line no-implicit-any error
    mock.onGet(new RegExp(`${ip}`)).reply(200, getIpInfo(ip))

    const ipInfo = await IpFetcher().fetchIPInfoWithinRegionCheckBudget(ip)
    expect(ipInfo).toBeInstanceOf(Error)
    // @ts-ignore-next-line no-implicit-any error
    expect(mock.history.get).toHaveLength(0)
  })
})

const getIpInfo = (ip: string) => ({
  status: "ok",
  [ip]: {
    asn: "AS52228",
    provider: "Cable Tica",
    organisation: "Cable Tica",
    continent: "North America",
    country: "Costa Rica",
    isocode: "CR",
    region: "Provincia de San Jose",
    regioncode: "SJ",
    city: "Perez Zeledon",
    latitude: 9.3573,
    longitude: -83.6356,
    proxy: "no",
    type: "Residential",
  },
})
