import https from "https"

import axios from "axios"
import axiosRetry from "axios-retry"

import { UnknownIpFetcherServiceError } from "@/domain/ipfetcher"
import { PROXY_CHECK_APIKEY } from "@/config"
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

export const client = axios.create({
  timeout: 2000,
  httpsAgent: new https.Agent({ keepAlive: true }),
})
axiosRetry(client, {
  retries: 3,
  retryDelay: () => 500,
  shouldResetTimeout: true,
})

export const IpFetcher = (): IIpFetcherService => {
  const fetchIPInfo = async (ip: string): Promise<IPInfo | IpFetcherServiceError> => {
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
  return {
    fetchIPInfo,
  }
}
