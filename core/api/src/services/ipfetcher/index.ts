import https from "https"

import { create as createAxiosInstance } from "axios"
import axiosRetry, { linearDelay } from "axios-retry"

import {
  IpFetcherBudgetExceededError,
  UnknownIpFetcherServiceError,
  UnresolvedIpFetcherServiceError,
} from "@/domain/ipfetcher"
import { PROXY_CHECK_APIKEY } from "@/config"
import { RateLimitConfig } from "@/domain/rate-limit"
import { toSeconds } from "@/domain/primitives"
import { RedisCacheService } from "@/services/cache"
import { consumeLimiter } from "@/services/rate-limit"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

type Params = {
  vpn: string
  asn: string
  time: string
  risk: string
  key?: string
}

const IP_INFO_CACHE_TTL = toSeconds(300)

export const client = createAxiosInstance({
  timeout: 2000,
  httpsAgent: new https.Agent({ keepAlive: true }),
})
axiosRetry(client, {
  retries: 4,
  retryDelay: linearDelay(200),
  shouldResetTimeout: true,
})

const cacheKey = (ip: IpAddress): string => `ipfetcher:info:${ip}`

export const IpFetcher = (): IIpFetcherService => {
  const cache = RedisCacheService()

  const fetchFromProvider = async (
    ip: string,
  ): Promise<IPInfo | IpFetcherServiceError> => {
    const params: Params = {
      vpn: "1",
      asn: "1",
      time: "1",
      risk: "1",
    }

    let keyIsPresent = true

    if (PROXY_CHECK_APIKEY) {
      params["key"] = PROXY_CHECK_APIKEY
    } else {
      keyIsPresent = false
    }

    try {
      const { data } = await client.request({
        url: `https://proxycheck.io/v2/${ip}`,
        params,
      })

      const proxy = !!(data[ip] && data[ip].proxy && data[ip].proxy === "yes")
      const isoCode = data[ip] && data[ip].isocode
      const type = data[ip] ? `${data[ip].type}` : ""
      const risk = Number(data[ip]?.risk) || 0

      addAttributesToCurrentSpan({ proxy, risk, type, isoCode, keyIsPresent })
      return { ...data[ip], isoCode, proxy, risk, type, status: data.status }
    } catch (error) {
      recordExceptionInCurrentSpan({ error, attributes: { ip, keyIsPresent } })
      return new UnknownIpFetcherServiceError(error)
    }
  }

  const cached = async (ip: IpAddress): Promise<IPInfo | undefined> => {
    const value = await cache.get<IPInfo>({ key: cacheKey(ip) })
    return value instanceof Error ? undefined : value
  }

  // successes only: a cached error would latch the region verdict fail-open for the TTL
  const cacheOnSuccess = async (ip: IpAddress, info: IPInfo): Promise<IPInfo> => {
    await cache.set({ key: cacheKey(ip), value: info, ttlSecs: IP_INFO_CACHE_TTL })
    return info
  }

  // login/onboarding path: untouched by the region machinery — no cache, no budget
  const fetchIPInfo = async (ip: IpAddress): Promise<IPInfo | IpFetcherServiceError> =>
    fetchFromProvider(ip)

  const fetchIPInfoWithinRegionCheckBudget = async (
    ip: IpAddress,
  ): Promise<IPInfo | IpFetcherServiceError> => {
    const hit = await cached(ip)
    if (hit) return hit

    const budgetOk = await consumeLimiter({
      rateLimitConfig: RateLimitConfig.regionCheckIpResolution,
      keyToConsume: "",
    })
    if (budgetOk instanceof Error) return new IpFetcherBudgetExceededError()

    const info = await fetchFromProvider(ip)
    if (info instanceof Error) return info
    if (info.status !== "ok" || !info.isoCode) {
      return new UnresolvedIpFetcherServiceError(`status: ${info.status}`)
    }

    return cacheOnSuccess(ip, info)
  }

  return {
    fetchIPInfo,
    fetchIPInfoWithinRegionCheckBudget,
  }
}
