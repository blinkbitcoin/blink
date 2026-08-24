import http from "http"
import https from "https"

import { create as createAxiosInstance } from "axios"
import axiosRetry, { linearDelay } from "axios-retry"

import { BTCMAP_API_TOKEN, BTCMAP_API_URL } from "@/config"
import { BtcMapSubmitPlaceError } from "@/domain/btcmap/errors"
import { ErrorLevel } from "@/domain/shared"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

const client = createAxiosInstance({
  timeout: 5000,
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
})
axiosRetry(client, {
  retries: 2,
  retryDelay: linearDelay(200),
  shouldResetTimeout: true,
  retryCondition: (error) =>
    !error.response || error.code === "ECONNABORTED" || error.response.status >= 500,
})

type SubmitPlaceResult = {
  id: number
  origin: string
  external_id: string
}

const isValidResult = (result: unknown): result is SubmitPlaceResult => {
  if (!result || typeof result !== "object") return false
  const { id, origin, external_id } = result as Record<string, unknown>
  return (
    typeof id === "number" &&
    typeof origin === "string" &&
    typeof external_id === "string"
  )
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
}): Promise<SubmitPlaceResult | BtcMapSubmitPlaceError> => {
  if (!BTCMAP_API_URL || !BTCMAP_API_TOKEN) {
    recordExceptionInCurrentSpan({
      error: "missing BTCMAP_API_URL or BTCMAP_API_TOKEN",
      level: ErrorLevel.Critical,
    })
    return new BtcMapSubmitPlaceError("btcmap service not configured")
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
        level: ErrorLevel.Warn,
      })
      return new BtcMapSubmitPlaceError("place submission failed")
    }

    if (!isValidResult(data.result)) {
      recordExceptionInCurrentSpan({
        error: "malformed submit_place result",
        attributes: { externalId, result: JSON.stringify(data.result) },
        level: ErrorLevel.Critical,
      })
      return new BtcMapSubmitPlaceError("place submission failed")
    }

    addAttributesToCurrentSpan({ btcMapPlaceId: data.result.id, externalId })
    return data.result
  } catch (error) {
    recordExceptionInCurrentSpan({
      error,
      attributes: { externalId },
      level: ErrorLevel.Critical,
    })
    return new BtcMapSubmitPlaceError("place submission failed")
  }
}
