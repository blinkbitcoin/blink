import { NextRequest, NextResponse } from "next/server"
import { bech32 } from "bech32"

import { baseLogger } from "@/lib/logger"
import {
  SafeFetchError,
  safeFetchJson,
  safeFetchJsonResponse,
} from "@/lib/server/safe-fetch-json"

type WithdrawRequestParams = {
  tag: "withdrawRequest"
  callback: string
  k1: string
}

const MAX_LNURL_LENGTH = 2048
const MAX_K1_LENGTH = 128
const BOLT11_REGEX = /^ln[a-z0-9]{20,2000}$/i

const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 })

const decodeLnurlToUrl = (lnurl: string): URL | null => {
  const trimmed = lnurl.trim()

  if (/^lnurl1[a-z0-9]+$/i.test(trimmed)) {
    try {
      const { words } = bech32.decode(trimmed.toLowerCase(), MAX_LNURL_LENGTH * 2)
      const decoded = Buffer.from(bech32.fromWords(words)).toString("utf8")
      return new URL(decoded)
    } catch {
      return null
    }
  }

  if (/^lnurlw:\/\//i.test(trimmed)) {
    try {
      return new URL(`https://${trimmed.slice("lnurlw://".length)}`)
    } catch {
      return null
    }
  }

  try {
    return new URL(trimmed)
  } catch {
    return null
  }
}

const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data)

const isWithdrawRequestParams = (data: unknown): data is WithdrawRequestParams =>
  isRecord(data) &&
  data.tag === "withdrawRequest" &&
  typeof data.callback === "string" &&
  typeof data.k1 === "string"

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON body")
  }

  if (!isRecord(body)) {
    return badRequest("Invalid JSON body")
  }

  const { lnurl, paymentRequest } = body

  if (
    typeof lnurl !== "string" ||
    lnurl.length === 0 ||
    lnurl.length > MAX_LNURL_LENGTH
  ) {
    return badRequest("Missing or invalid lnurl parameter")
  }

  if (typeof paymentRequest !== "string" || !BOLT11_REGEX.test(paymentRequest)) {
    return badRequest("Missing or invalid paymentRequest parameter")
  }

  const serviceUrl = decodeLnurlToUrl(lnurl)
  if (!serviceUrl || serviceUrl.protocol !== "https:") {
    return badRequest("Invalid lnurl")
  }

  try {
    const serviceResponse = await safeFetchJsonResponse(serviceUrl.toString())
    const params = serviceResponse.data

    if (!isWithdrawRequestParams(params) || params.k1.length > MAX_K1_LENGTH) {
      return badRequest("Not a properly configured lnurl withdraw tag")
    }

    let callbackUrl: URL
    try {
      callbackUrl = new URL(params.callback)
    } catch {
      return badRequest("Invalid callback URL")
    }

    if (
      callbackUrl.protocol !== "https:" ||
      callbackUrl.hostname !== new URL(serviceResponse.url).hostname
    ) {
      return badRequest("Invalid callback URL")
    }

    callbackUrl.searchParams.set("k1", params.k1)
    callbackUrl.searchParams.set("pr", paymentRequest)

    const callbackResponse = await safeFetchJson(callbackUrl.toString())
    const status =
      isRecord(callbackResponse) && typeof callbackResponse.status === "string"
        ? callbackResponse.status
        : ""

    if (status.toUpperCase() === "OK") {
      return NextResponse.json({ status: "OK" }, { status: 200 })
    }

    const reason =
      isRecord(callbackResponse) && typeof callbackResponse.reason === "string"
        ? callbackResponse.reason.slice(0, 280)
        : "Withdraw request failed"
    return NextResponse.json({ status: "ERROR", reason }, { status: 400 })
  } catch (error) {
    if (error instanceof SafeFetchError) {
      return badRequest("LNURL service unreachable or not allowed")
    }

    baseLogger.error({ err: error }, "Error processing LNURL request")
    return NextResponse.json(
      { error: "Failed to process LNURL request" },
      { status: 500 },
    )
  }
}
