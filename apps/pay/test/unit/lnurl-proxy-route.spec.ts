/** @jest-environment node */

import { bech32 } from "bech32"
import { NextRequest } from "next/server"

type SafeJsonResponse = { data: unknown; url: string }

const mockLoggerError = jest.fn()
const mockSafeFetchJson = jest.fn<Promise<unknown>, [string]>()
const mockSafeFetchJsonResponse = jest.fn<Promise<SafeJsonResponse>, [string]>()

jest.mock("@/lib/logger", () => ({
  baseLogger: {
    error: (context: unknown, message: string) => mockLoggerError(context, message),
  },
}))

jest.mock("@/lib/server/safe-fetch-json", () => {
  class SafeFetchError extends Error {}
  return {
    SafeFetchError,
    safeFetchJson: (url: string) => mockSafeFetchJson(url),
    safeFetchJsonResponse: (url: string) => mockSafeFetchJsonResponse(url),
  }
})

import { POST } from "../../app/api/lnurl-proxy/route"
import { SafeFetchError } from "../../lib/server/safe-fetch-json"

const expect = globalThis.expect as unknown as jest.Expect
const jestIt = globalThis.it as unknown as jest.It
const PAYMENT_REQUEST = `lnbc${"a".repeat(24)}`
const SERVICE_URL = "https://cards.example/withdraw"

const request = (body: unknown) =>
  new NextRequest("https://pay.example/api/lnurl-proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

const post = async (body: unknown) => {
  const response = await POST(request(body))
  return { response, json: await response.json() }
}

const withdrawParams = (
  overrides: Partial<{ tag: string; callback: string; k1: string }> = {},
) => ({
  tag: "withdrawRequest",
  callback: "https://cards.example/callback?existing=1&k1=old&pr=old",
  k1: "challenge",
  ...overrides,
})

const serviceResponse = (data: unknown, url = SERVICE_URL): SafeJsonResponse => ({
  data,
  url,
})

describe("POST /api/lnurl-proxy", () => {
  it("rejects an invalid JSON body", async () => {
    const response = await POST(
      new NextRequest("https://pay.example/api/lnurl-proxy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" })
  })

  jestIt.each([
    [null, "Invalid JSON body"],
    [[], "Invalid JSON body"],
    [{ paymentRequest: PAYMENT_REQUEST }, "Missing or invalid lnurl parameter"],
    [
      { lnurl: 42, paymentRequest: PAYMENT_REQUEST },
      "Missing or invalid lnurl parameter",
    ],
    [
      { lnurl: "", paymentRequest: PAYMENT_REQUEST },
      "Missing or invalid lnurl parameter",
    ],
    [
      { lnurl: "x".repeat(2049), paymentRequest: PAYMENT_REQUEST },
      "Missing or invalid lnurl parameter",
    ],
    [{ lnurl: SERVICE_URL }, "Missing or invalid paymentRequest parameter"],
    [
      { lnurl: SERVICE_URL, paymentRequest: 42 },
      "Missing or invalid paymentRequest parameter",
    ],
    [
      { lnurl: SERVICE_URL, paymentRequest: "not-an-invoice" },
      "Missing or invalid paymentRequest parameter",
    ],
  ])("rejects invalid input %#", async (body, error) => {
    const result = await post(body)
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error })
    expect(mockSafeFetchJsonResponse).not.toHaveBeenCalled()
    expect(mockSafeFetchJson).not.toHaveBeenCalled()
  })

  jestIt.each([
    "not a url",
    "http://cards.example/withdraw",
    "lnurl1invalid",
    "lnurlw://[",
  ])("rejects an invalid LNURL representation: %s", async (lnurl) => {
    const result = await post({ lnurl, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "Invalid lnurl" })
    expect(mockSafeFetchJsonResponse).not.toHaveBeenCalled()
    expect(mockSafeFetchJson).not.toHaveBeenCalled()
  })

  it("decodes bech32 and lnurlw inputs", async () => {
    const encoded = bech32.encode(
      "lnurl",
      bech32.toWords(Buffer.from(SERVICE_URL, "utf8")),
      4096,
    )
    mockSafeFetchJsonResponse
      .mockResolvedValueOnce(serviceResponse(withdrawParams()))
      .mockResolvedValueOnce(serviceResponse(withdrawParams()))
    mockSafeFetchJson.mockResolvedValue({ status: "OK" })

    expect(
      (await post({ lnurl: encoded, paymentRequest: PAYMENT_REQUEST })).response.status,
    ).toBe(200)
    expect(
      (
        await post({
          lnurl: "LNURLW://cards.example/withdraw",
          paymentRequest: PAYMENT_REQUEST,
        })
      ).response.status,
    ).toBe(200)
    expect(mockSafeFetchJsonResponse.mock.calls[0][0]).toBe(SERVICE_URL)
    expect(mockSafeFetchJsonResponse.mock.calls[1][0]).toBe(SERVICE_URL)
  })

  it("retrieves service parameters instead of accepting URL query fields", async () => {
    const lnurl = new URL(SERVICE_URL)
    lnurl.searchParams.set("tag", "withdrawRequest")
    lnurl.searchParams.set("k1", "query-challenge")
    lnurl.searchParams.set("callback", "http://127.0.0.1/callback")
    mockSafeFetchJsonResponse.mockResolvedValueOnce(
      serviceResponse({ status: "ERROR" }, lnurl.toString()),
    )

    const result = await post({
      lnurl: lnurl.toString(),
      paymentRequest: PAYMENT_REQUEST,
    })

    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "Not a properly configured lnurl withdraw tag" })
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledTimes(1)
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledWith(lnurl.toString())
    expect(mockSafeFetchJson).not.toHaveBeenCalled()
  })

  jestIt.each([
    null,
    [],
    {},
    { tag: "payRequest", callback: "https://cards.example/callback", k1: "challenge" },
    { tag: "withdrawRequest", callback: 42, k1: "challenge" },
    { tag: "withdrawRequest", callback: "https://cards.example/callback", k1: 42 },
    withdrawParams({ k1: "x".repeat(129) }),
  ])("rejects invalid service parameters %#", async (params) => {
    mockSafeFetchJsonResponse.mockResolvedValueOnce(serviceResponse(params))

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "Not a properly configured lnurl withdraw tag" })
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledTimes(1)
    expect(mockSafeFetchJson).not.toHaveBeenCalled()
  })

  jestIt.each([
    "not a url",
    "http://cards.example/callback",
    "https://other.example/callback",
    "https://127.0.0.1/callback",
    "https://10.0.0.1/callback",
    "https://100.64.0.1/callback",
    "https://169.254.169.254/callback",
    "https://172.16.0.1/callback",
    "https://192.168.0.1/callback",
    "https://[::1]/callback",
    "https://[fd00::1]/callback",
    "https://[::ffff:127.0.0.1]/callback",
  ])("rejects callback URL %s", async (callback) => {
    mockSafeFetchJsonResponse.mockResolvedValueOnce(
      serviceResponse(withdrawParams({ callback })),
    )

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "Invalid callback URL" })
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledTimes(1)
    expect(mockSafeFetchJson).not.toHaveBeenCalled()
  })

  it("accepts a callback on the final service host after a redirect", async () => {
    const initialUrl = "https://www.cards.example/withdraw"
    mockSafeFetchJsonResponse.mockResolvedValueOnce(
      serviceResponse(withdrawParams(), SERVICE_URL),
    )
    mockSafeFetchJson.mockResolvedValueOnce({ status: "OK" })

    const result = await post({ lnurl: initialUrl, paymentRequest: PAYMENT_REQUEST })

    expect(result.response.status).toBe(200)
    expect(result.json).toEqual({ status: "OK" })
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledWith(initialUrl)
  })

  it("submits the challenge and invoice while preserving unrelated query parameters", async () => {
    mockSafeFetchJsonResponse.mockResolvedValueOnce(serviceResponse(withdrawParams()))
    mockSafeFetchJson.mockResolvedValueOnce({ status: "ok", extra: "not returned" })

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })

    expect(result.response.status).toBe(200)
    expect(result.json).toEqual({ status: "OK" })
    expect(mockSafeFetchJsonResponse).toHaveBeenCalledTimes(1)
    expect(mockSafeFetchJson).toHaveBeenCalledTimes(1)
    const callback = new URL(mockSafeFetchJson.mock.calls[0][0])
    expect(callback.origin + callback.pathname).toBe("https://cards.example/callback")
    expect(callback.searchParams.get("existing")).toBe("1")
    expect(callback.searchParams.get("k1")).toBe("challenge")
    expect(callback.searchParams.get("pr")).toBe(PAYMENT_REQUEST)
  })

  it("returns a bounded service error reason", async () => {
    const reason = "x".repeat(300)
    mockSafeFetchJsonResponse.mockResolvedValueOnce(serviceResponse(withdrawParams()))
    mockSafeFetchJson.mockResolvedValueOnce({
      status: "ERROR",
      reason,
      extra: "not returned",
    })

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ status: "ERROR", reason: reason.slice(0, 280) })
  })

  jestIt.each([null, [], {}, { status: 42 }, { status: "ERROR", reason: 42 }])(
    "uses a stable fallback for an invalid callback response %#",
    async (callbackResponse) => {
      mockSafeFetchJsonResponse.mockResolvedValueOnce(serviceResponse(withdrawParams()))
      mockSafeFetchJson.mockResolvedValueOnce(callbackResponse)

      const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
      expect(result.response.status).toBe(400)
      expect(result.json).toEqual({
        status: "ERROR",
        reason: "Withdraw request failed",
      })
    },
  )

  it("maps expected fetch failures to a client error", async () => {
    mockSafeFetchJsonResponse.mockRejectedValueOnce(new SafeFetchError("unavailable"))

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "LNURL service unreachable or not allowed" })
  })

  it("maps callback fetch failures to a client error", async () => {
    mockSafeFetchJsonResponse.mockResolvedValueOnce(serviceResponse(withdrawParams()))
    mockSafeFetchJson.mockRejectedValueOnce(new SafeFetchError("unavailable"))

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(400)
    expect(result.json).toEqual({ error: "LNURL service unreachable or not allowed" })
  })

  it("does not expose unexpected processing errors", async () => {
    const error = new Error("unexpected detail")
    mockSafeFetchJsonResponse.mockRejectedValueOnce(error)

    const result = await post({ lnurl: SERVICE_URL, paymentRequest: PAYMENT_REQUEST })
    expect(result.response.status).toBe(500)
    expect(result.json).toEqual({ error: "Failed to process LNURL request" })
    expect(mockLoggerError).toHaveBeenCalledWith(
      { err: error },
      "Error processing LNURL request",
    )
  })
})
