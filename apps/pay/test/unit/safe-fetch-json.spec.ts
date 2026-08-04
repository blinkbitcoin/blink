/** @jest-environment node */

import { EventEmitter } from "node:events"
import { type LookupFunction } from "node:net"

type Address = { address: string; family: number }
type RequestOptions = {
  hostname?: string
  path?: string
  timeout?: number
  lookup?: LookupFunction
  signal?: AbortSignal
}

class FakeRequest extends EventEmitter {
  end = jest.fn()
  destroy = jest.fn((error?: Error) => {
    if (error) queueMicrotask(() => this.emit("error", error))
    return this
  })
}

class FakeResponse extends EventEmitter {
  statusCode: number | undefined
  headers: Record<string, string | string[] | undefined>
  resume = jest.fn()

  constructor(
    statusCode: number | undefined,
    headers: Record<string, string | string[] | undefined>,
  ) {
    super()
    this.statusCode = statusCode
    this.headers = headers
  }
}

type ResponseHandler = (response: FakeResponse) => void

const mockLookup = jest.fn<Promise<Address[]>, [string, object]>()
const mockRequest = jest.fn<FakeRequest, [RequestOptions, ResponseHandler]>()

jest.mock("node:dns/promises", () => ({
  lookup: (hostname: string, options: object) => mockLookup(hostname, options),
}))

jest.mock("node:https", () => ({
  __esModule: true,
  default: {
    request: (options: RequestOptions, handler: ResponseHandler) =>
      mockRequest(options, handler),
  },
}))

import {
  SafeFetchError,
  safeFetchJson,
  safeFetchJsonResponse,
} from "../../lib/server/safe-fetch-json"

const expect = globalThis.expect as unknown as jest.Expect
const jestIt = globalThis.it as unknown as jest.It

const PUBLIC_ADDRESS: Address = { address: "8.8.8.8", family: 4 }

const queueResponse = ({
  status = 200,
  headers = { "content-type": "application/json" },
  chunks = [Buffer.from('{"status":"OK"}')],
}: {
  status?: number
  headers?: Record<string, string | string[] | undefined>
  chunks?: Buffer[]
} = {}) => {
  const response = new FakeResponse(status, headers)
  mockRequest.mockImplementationOnce((_options, handler) => {
    const request = new FakeRequest()
    queueMicrotask(() => {
      handler(response)
      for (const chunk of chunks) response.emit("data", chunk)
      response.emit("end")
    })
    return request
  })
  return response
}

describe("safeFetchJson", () => {
  beforeEach(() => {
    mockLookup.mockResolvedValue([PUBLIC_ADDRESS])
  })

  it("returns parsed JSON from a public HTTPS endpoint", async () => {
    queueResponse({ chunks: [Buffer.from('{"value":42}')] })

    await expect(safeFetchJson("https://service.example/path?q=1")).resolves.toEqual({
      value: 42,
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        hostname: "service.example",
        path: "/path?q=1",
        timeout: 5_000,
      }),
      expect.any(Function),
    )
  })

  it("rejects malformed and non-HTTPS URLs before requesting them", async () => {
    await expect(safeFetchJson("not a url")).rejects.toBeInstanceOf(SafeFetchError)
    await expect(safeFetchJson("http://service.example/path")).rejects.toThrow(
      "only https URLs are allowed",
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  jestIt.each([
    "0.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "3fff::1",
    "::ffff:127.0.0.1",
  ])("rejects the non-public address %s", async (address) => {
    const host = address.includes(":") ? `[${address}]` : address

    await expect(safeFetchJson(`https://${host}/data`)).rejects.toThrow(
      "hostname does not resolve to a public address",
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it("accepts public IPv4, IPv6, and mapped IPv4 literals", async () => {
    for (const address of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      queueResponse()
      const host = address.includes(":") ? `[${address}]` : address
      await expect(safeFetchJson(`https://${host}/data`)).resolves.toEqual({
        status: "OK",
      })
    }
    expect(mockLookup).not.toHaveBeenCalled()
  })

  it("rejects a hostname when resolution has no public address", async () => {
    mockLookup.mockResolvedValue([
      { address: "127.0.0.1", family: 4 },
      { address: "fd00::1", family: 6 },
    ])

    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "hostname does not resolve to a public address",
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it("rejects resolver results with an unknown address family", async () => {
    mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 0 }])

    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "hostname does not resolve to a public address",
    )
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it("uses only the selected public addresses during connection", async () => {
    mockLookup.mockResolvedValue([
      PUBLIC_ADDRESS,
      { address: "127.0.0.1", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ])
    queueResponse()

    await safeFetchJson("https://service.example/data")
    const options = mockRequest.mock.calls[0][0]
    const lookup = options.lookup
    if (!lookup) throw new Error("missing lookup function")
    const allResult = await new Promise<Address[]>((resolve, reject) => {
      lookup("service.example", { all: true }, (error, addresses) => {
        if (error) reject(error)
        else if (Array.isArray(addresses)) resolve(addresses)
        else reject(new Error("expected all lookup results"))
      })
    })
    const v6Result = await new Promise<{ address: string; family: number }>(
      (resolve, reject) => {
        lookup("service.example", { family: 6 }, (error, address, family) => {
          if (error) reject(error)
          else if (typeof address === "string" && typeof family === "number") {
            resolve({ address, family })
          } else reject(new Error("expected one lookup result"))
        })
      },
    )

    expect(allResult).toEqual([
      PUBLIC_ADDRESS,
      { address: "2606:4700:4700::1111", family: 6 },
    ])
    expect(v6Result).toEqual({ address: "2606:4700:4700::1111", family: 6 })
    expect(mockLookup).toHaveBeenCalledTimes(1)
  })

  it("reports when the connection requests an unavailable address family", async () => {
    queueResponse()
    await safeFetchJson("https://service.example/data")
    const lookup = mockRequest.mock.calls[0][0].lookup
    if (!lookup) throw new Error("missing lookup function")

    await expect(
      new Promise((resolve, reject) => {
        lookup("service.example", { family: 6 }, (error, address) => {
          if (error) reject(error)
          else resolve(address)
        })
      }),
    ).rejects.toThrow("no address matches the requested family")
  })

  it("follows an HTTPS redirect and resolves the new host", async () => {
    const redirect = queueResponse({
      status: 302,
      headers: { location: "https://other.example/final" },
      chunks: [],
    })
    queueResponse({ chunks: [Buffer.from('{"done":true}')] })

    await expect(safeFetchJsonResponse("https://service.example/start")).resolves.toEqual(
      {
        data: { done: true },
        url: "https://other.example/final",
      },
    )
    expect(redirect.resume).toHaveBeenCalled()
    expect(mockLookup).toHaveBeenCalledTimes(2)
    expect(mockRequest.mock.calls[1][0]).toEqual(
      expect.objectContaining({ hostname: "other.example", path: "/final" }),
    )
    expect(mockRequest.mock.calls[0][0].signal).toBe(mockRequest.mock.calls[1][0].signal)
  })

  it("rejects a redirect to a non-HTTPS URL before another request", async () => {
    queueResponse({
      status: 302,
      headers: { location: "http://127.0.0.1/data" },
      chunks: [],
    })

    await expect(safeFetchJson("https://service.example/start")).rejects.toThrow(
      "only https URLs are allowed",
    )
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("rejects a redirect to a non-public address before another request", async () => {
    queueResponse({
      status: 302,
      headers: { location: "https://127.0.0.1/data" },
      chunks: [],
    })

    await expect(safeFetchJson("https://service.example/start")).rejects.toThrow(
      "hostname does not resolve to a public address",
    )
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("rejects redirects without a valid location", async () => {
    const missing = queueResponse({ status: 301, headers: {}, chunks: [] })
    await expect(safeFetchJson("https://service.example/start")).rejects.toThrow(
      "redirect without a location",
    )
    expect(missing.resume).toHaveBeenCalled()

    queueResponse({ status: 302, headers: { location: "https://[" }, chunks: [] })
    await expect(safeFetchJson("https://service.example/start")).rejects.toThrow(
      "invalid redirect target",
    )
  })

  it("limits redirect depth", async () => {
    for (let index = 0; index < 4; index += 1) {
      queueResponse({
        status: 302,
        headers: { location: `/redirect-${index}` },
        chunks: [],
      })
    }

    await expect(safeFetchJson("https://service.example/start")).rejects.toThrow(
      "too many redirects",
    )
    expect(mockRequest).toHaveBeenCalledTimes(4)
  })

  it("rejects unsuccessful responses", async () => {
    const missingStatus = queueResponse({ chunks: [] })
    missingStatus.statusCode = undefined
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "upstream returned HTTP 0",
    )

    const unsuccessful = queueResponse({ status: 503, chunks: [] })
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "upstream returned HTTP 503",
    )
    expect(unsuccessful.resume).toHaveBeenCalled()
  })

  jestIt.each(["text/plain", undefined])(
    "accepts valid JSON with content type %s",
    async (contentType) => {
      queueResponse({ headers: { "content-type": contentType } })
      await expect(safeFetchJson("https://service.example/data")).resolves.toEqual({
        status: "OK",
      })
    },
  )

  it("enforces a total request deadline", async () => {
    jest.useFakeTimers()
    try {
      mockRequest.mockImplementationOnce(() => new FakeRequest())
      const result = safeFetchJson("https://service.example/data")
      const rejection = expect(result).rejects.toThrow(
        "upstream request deadline exceeded",
      )

      await jest.advanceTimersByTimeAsync(0)
      expect(mockRequest).toHaveBeenCalledTimes(1)
      const signal = mockRequest.mock.calls[0][0].signal
      expect(signal?.aborted).toBe(false)

      await jest.advanceTimersByTimeAsync(15_000)
      await rejection
      expect(signal?.aborted).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it("rejects oversized and malformed JSON bodies", async () => {
    queueResponse({
      chunks: [Buffer.alloc(16 * 1024), Buffer.from("x"), Buffer.from("ignored")],
    })
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "response too large",
    )

    queueResponse({ chunks: [Buffer.from("not-json")] })
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "invalid JSON from upstream",
    )
  })

  it("rejects timeouts and response stream errors", async () => {
    mockRequest.mockImplementationOnce(() => {
      const request = new FakeRequest()
      queueMicrotask(() => request.emit("timeout"))
      return request
    })
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "upstream request timed out",
    )

    mockRequest.mockImplementationOnce((_options, handler) => {
      const request = new FakeRequest()
      queueMicrotask(() => {
        const response = new FakeResponse(200, {
          "content-type": "application/json",
        })
        handler(response)
        response.emit("error", new Error("stream failed"))
      })
      return request
    })
    await expect(safeFetchJson("https://service.example/data")).rejects.toBeInstanceOf(
      SafeFetchError,
    )
  })

  it("normalizes resolver and request errors", async () => {
    mockLookup.mockRejectedValueOnce(new Error("lookup failed"))
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "upstream request failed",
    )

    mockRequest.mockImplementationOnce(() => {
      const request = new FakeRequest()
      queueMicrotask(() => request.emit("error", new Error("request failed")))
      return request
    })
    await expect(safeFetchJson("https://service.example/data")).rejects.toThrow(
      "upstream request failed",
    )
  })
})
