import http from "http"
import https from "https"

import { create as createAxiosInstance } from "axios"
import axiosRetry, { linearDelay } from "axios-retry"

import { BTCMAP_API_TOKEN, BTCMAP_API_URL, ConfigError } from "@/config"
import { BtcMapSubmitPlaceError } from "@/domain/btcmap/errors"
import { ErrorLevel } from "@/domain/shared"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

export const client = createAxiosInstance({
  timeout: 5000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
})
axiosRetry(client, {
  retries: 2,
  retryDelay: linearDelay(200),
  shouldResetTimeout: true,
})

type SubmitPlaceResult = {
  id: number
  origin: string
  external_id: string
}

export const submitPlace = async ({
  externalId,
  lat,
  lon,
  category,
  name,
  extraFields,
}: {
  externalId: string
  lat: number
  lon: number
  category: string
  name: string
  extraFields?: Record<string, unknown>
}): Promise<SubmitPlaceResult | BtcMapSubmitPlaceError | ConfigError<unknown>> => {
  if (!BTCMAP_API_URL || !BTCMAP_API_TOKEN) {
    recordExceptionInCurrentSpan({
      error: "missing BTCMAP_API_URL or BTCMAP_API_TOKEN",
      level: ErrorLevel.Critical,
    })
    return new ConfigError("missing BTCMAP_API_URL or BTCMAP_API_TOKEN")
  }

  try {
    const { data } = await client.request({
      method: "POST",
      url: BTCMAP_API_URL,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${BTCMAP_API_TOKEN}`,
      },
      data: {
        jsonrpc: "2.0",
        method: "submit_place",
        params: {
          origin: "blink",
          external_id: externalId,
          lat,
          lon,
          category,
          name,
          ...(extraFields ? { extra_fields: extraFields } : {}),
        },
        id: 1,
      },
    })

    if (data.error) {
      recordExceptionInCurrentSpan({
        error: data.error,
        attributes: { externalId },
        level: ErrorLevel.Critical,
      })
      return new BtcMapSubmitPlaceError(data.error.message)
    }

    addAttributesToCurrentSpan({ btcMapPlaceId: data.result.id, externalId })
    return data.result
  } catch (error) {
    recordExceptionInCurrentSpan({ error, attributes: { externalId } })
    return new BtcMapSubmitPlaceError(error)
  }
}
