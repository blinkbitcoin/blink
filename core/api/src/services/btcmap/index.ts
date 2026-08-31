import http from "http"
import https from "https"

import { create as createAxiosInstance } from "axios"
import axiosRetry, { linearDelay } from "axios-retry"

import { handleBtcMapErrors } from "./errors"

import { BTCMAP_API_TOKEN, BTCMAP_API_URL } from "@/config"
import {
  BtcMapNotConfiguredError,
  BtcMapSubmitPlaceRejectedError,
  MalformedBtcMapResponseError,
} from "@/domain/btcmap/errors"
import { ErrorLevel } from "@/domain/shared"
import { baseLogger } from "@/services/logger"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
  wrapAsyncFunctionsToRunInSpan,
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
  retryCondition: (error) =>
    !error.response || error.code === "ECONNABORTED" || error.response.status >= 500,
})

const isValidResult = (result: unknown): result is BtcMapSubmitPlaceResult => {
  if (!result || typeof result !== "object") return false
  const { id, origin, external_id } = result as Record<string, unknown>
  return (
    typeof id === "number" &&
    typeof origin === "string" &&
    typeof external_id === "string"
  )
}

// Blink is the data source, not the end user
export const BTCMAP_ORIGIN = "blink"

export const BtcMapService = (): IBtcMapService | BtcMapNotConfiguredError => {
  if (!BTCMAP_API_URL || !BTCMAP_API_TOKEN) {
    baseLogger.warn("BtcMapService not configured")
    return new BtcMapNotConfiguredError("BTCMAP_API_URL or BTCMAP_API_TOKEN is not set")
  }

  const url = BTCMAP_API_URL
  const token = BTCMAP_API_TOKEN

  const submitPlace = async ({
    externalId,
    lat,
    lon,
    category,
    name,
    extraFields,
  }: BtcMapSubmitPlaceArgs): Promise<BtcMapSubmitPlaceResult | BtcMapServiceError> => {
    try {
      const { data } = await client.request({
        method: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        data: {
          jsonrpc: "2.0",
          method: "submit_place",
          params: {
            origin: BTCMAP_ORIGIN,
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
          error: new Error(`submit_place rejected: ${JSON.stringify(data.error)}`),
          attributes: { externalId },
          level: ErrorLevel.Warn,
        })
        return new BtcMapSubmitPlaceRejectedError()
      }

      if (!isValidResult(data.result)) {
        recordExceptionInCurrentSpan({
          error: new Error("malformed submit_place result"),
          attributes: { externalId, result: JSON.stringify(data.result) },
          level: ErrorLevel.Critical,
        })
        return new MalformedBtcMapResponseError()
      }

      addAttributesToCurrentSpan({ btcMapPlaceId: data.result.id, externalId })
      return data.result
    } catch (err) {
      const error = handleBtcMapErrors(err)
      recordExceptionInCurrentSpan({
        error,
        attributes: { externalId },
        level: error.level,
      })
      return error
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.btcmap",
    fns: { submitPlace },
  })
}
