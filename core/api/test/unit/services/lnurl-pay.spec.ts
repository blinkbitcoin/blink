import { EventEmitter } from "node:events"
import type { LookupFunction } from "node:net"

import { ErrorFetchingLnurlInvoice } from "@/domain/bitcoin/lnurl/errors"
import { LnurlPayService } from "@/services/lnurl-pay"
import { safeFetchGet } from "@/services/lnurl-pay/safe-fetch"

type Address = { address: string; family: number }
type Options = {
  hostname: string
  path: string
  lookup: LookupFunction
  signal: AbortSignal
  agent: boolean
}
class Request extends EventEmitter {
  end = jest.fn()
  destroy = jest.fn((error?: Error) => {
    if (error) queueMicrotask(() => this.emit("error", error))
    return this
  })
}
class Response extends EventEmitter {
  statusCode: number | undefined = 200
  headers: { location?: string } = {}
  destroy = jest.fn()
}
const mockLookup = jest.fn<Promise<Address[]>, [string, object]>()
const mockRequest = jest.fn<Request, [Options, (res: Response) => void]>()
jest.mock("node:dns/promises", () => ({
  lookup: (...args: [string, object]) => mockLookup(...args),
}))
jest.mock("node:https", () => ({
  __esModule: true,
  default: {
    request: (...args: [Options, (res: Response) => void]) => mockRequest(...args),
  },
}))
jest.mock("@/services/tracing", () => ({
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

const publicAddress = { address: "8.8.8.8", family: 4 }
const genericError = "LNURL service unreachable or not allowed"
const fetchJson = (url = "https://service.example/pay") => safeFetchGet({ url })
const respond = (body: unknown = { ok: true }, status = 200, location?: string) => {
  const res = new Response()
  res.statusCode = status
  res.headers.location = location
  mockRequest.mockImplementationOnce((_options, handler) => {
    const req = new Request()
    queueMicrotask(() => {
      handler(res)
      res.emit("data", Buffer.from(JSON.stringify(body)))
      res.emit("end")
    })
    return req
  })
  return res
}

beforeEach(() => {
  jest.resetAllMocks()
  mockLookup.mockResolvedValue([publicAddress])
})

describe("LNURL safe HTTP transport", () => {
  it.each([
    "not a url",
    "http://service.example/",
    "https://service.example:8443/",
    "https://user@service.example/",
    "https://:password@service.example/",
    ...[
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.0.1",
      "192.0.0.1",
      "192.0.2.1",
      "192.88.99.1",
      "198.18.0.1",
      "198.51.100.1",
      "203.0.113.1",
      "224.0.0.1",
      "240.0.0.1",
      "2130706433",
      "0x7f000001",
      "0177.0.0.1",
      "127.1",
      "[::1]",
      "[::]",
      "[fc00::1]",
      "[fe80::1]",
      "[ff02::1]",
      "[::ffff:127.0.0.1]",
      "[64:ff9b::a00:1]",
      "[2002:7f00:1::]",
      "[2001::1]",
      "[2001:db8::1]",
      "[3fff::1]",
      "[4000::1]",
    ].map((host) => `https://${host}/`),
  ])("rejects unsafe destination %s without opening a socket", async (url) => {
    await expect(fetchJson(url)).rejects.toThrow(genericError)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it.each([
    [],
    [{ address: "127.0.0.1", family: 4 }],
    [publicAddress, { address: "10.0.0.1", family: 4 }],
    [{ address: "8.8.8.8", family: 6 }],
  ])("rejects empty, private, mixed or invalid DNS answers: %j", async (...answers) => {
    mockLookup.mockResolvedValue(answers as Address[])
    await expect(fetchJson()).rejects.toThrow(genericError)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it.each(["8.8.8.8", "[2606:4700:4700::1111]", "[::ffff:8.8.8.8]"])(
    "accepts public literal %s without DNS",
    async (host) => {
      respond()
      await expect(fetchJson(`https://${host}:443/`)).resolves.toEqual({ ok: true })
      expect(mockLookup).not.toHaveBeenCalled()
    },
  )

  it("pins DNS, preserves TLS hostname and query parameters, and disables pooled sockets", async () => {
    respond()
    await expect(
      safeFetchGet({
        url: "https://service.example/pay?k1=abc&amount=1",
        params: { amount: 1000 },
      }),
    ).resolves.toEqual({ ok: true })
    const options = mockRequest.mock.calls[0][0]
    expect(options).toMatchObject({
      hostname: "service.example",
      path: "/pay?k1=abc&amount=1000",
      agent: false,
    })
    mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])
    const callback = jest.fn()
    options.lookup("service.example", {}, callback)
    expect(callback).toHaveBeenLastCalledWith(null, "8.8.8.8", 4)
    options.lookup("service.example", { all: true, family: 4 }, callback)
    expect(callback).toHaveBeenLastCalledWith(null, [publicAddress])
    options.lookup("service.example", { family: 6 }, callback)
    expect(callback).toHaveBeenLastCalledWith(expect.any(Error), "")
    expect(mockLookup).toHaveBeenCalledTimes(1)
  })

  it.each([301, 302, 303, 307, 308])(
    "follows validated relative redirects (%s)",
    async (status) => {
      const redirect = respond({}, status, "/next")
      respond()
      await expect(fetchJson()).resolves.toEqual({ ok: true })
      expect(redirect.destroy).toHaveBeenCalled()
      expect(mockLookup).toHaveBeenCalledTimes(2)
      expect(mockRequest.mock.calls[1][0].path).toBe("/next")
    },
  )

  it.each([
    "http://service.example/",
    "https://169.254.169.254/",
    "https://[::1]/",
    "https://[",
    undefined,
  ])("rejects unsafe or invalid redirect %s", async (location) => {
    respond({}, 302, location)
    await expect(fetchJson()).rejects.toThrow(genericError)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("revalidates same-host redirects against DNS rebinding", async () => {
    mockLookup
      .mockResolvedValueOnce([publicAddress])
      .mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }])
    respond({}, 302, "/next")
    await expect(fetchJson()).rejects.toThrow(genericError)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("bounds redirects", async () => {
    for (let i = 0; i < 4; i += 1) respond({}, 302, "/next")
    await expect(fetchJson()).rejects.toThrow(genericError)
    expect(mockRequest).toHaveBeenCalledTimes(4)
  })

  it.each([null, [], "text", 42])("rejects non-object JSON %j", async (body) => {
    respond(body)
    await expect(fetchJson()).rejects.toThrow(genericError)
  })

  it.each([0, 199, 400, 503])("rejects HTTP status %s", async (status) => {
    const res = respond({}, status)
    if (status === 0) res.statusCode = undefined
    await expect(fetchJson()).rejects.toThrow(genericError)
    expect(res.destroy).toHaveBeenCalled()
  })

  it.each(["body", "json", "stream", "request", "timeout"])(
    "bounds or sanitizes %s failures",
    async (kind) => {
      mockRequest.mockImplementationOnce((_options, handler) => {
        const req = new Request()
        queueMicrotask(() => {
          if (kind === "request") {
            req.emit("error", new Error("private upstream"))
            return
          }
          if (kind === "timeout") {
            req.emit("timeout")
            return
          }
          const res = new Response()
          handler(res)
          if (kind === "stream") {
            res.emit("error", new Error("private upstream"))
            return
          }
          res.emit(
            "data",
            kind === "body" ? Buffer.alloc(1024 * 1024 + 1) : Buffer.from("invalid json"),
          )
          res.emit("data", Buffer.from("ignored"))
          res.emit("end")
        })
        return req
      })
      await expect(fetchJson()).rejects.toThrow(genericError)
    },
  )

  it("accepts an explicit LNURL success status", async () => {
    respond({ status: "OK" })
    await expect(fetchJson()).resolves.toEqual({ status: "OK" })
  })

  it("sanitizes LNURL discovery errors", async () => {
    respond({ status: "ERROR", reason: "private upstream" })
    await expect(fetchJson()).rejects.toThrow(genericError)
  })

  it("sanitizes DNS failures", async () => {
    mockLookup.mockRejectedValueOnce(new Error("internal hostname"))
    await expect(fetchJson()).rejects.toThrow(genericError)
  })

  it("accepts a JSON body exactly at the byte limit", async () => {
    const body = { data: "x".repeat(1024 * 1024 - 11) }
    expect(Buffer.byteLength(JSON.stringify(body))).toBe(1024 * 1024)
    respond(body)
    await expect(fetchJson()).resolves.toEqual(body)
  })

  it.each(["dns", "socket"])(
    "bounds the total deadline during %s and stops late connections",
    async (phase) => {
      jest.useFakeTimers()
      let resolveDns!: (addresses: Address[]) => void
      try {
        if (phase === "dns")
          mockLookup.mockImplementationOnce(
            () =>
              new Promise((resolve) => {
                resolveDns = resolve
              }),
          )
        mockRequest.mockImplementationOnce(() => new Request())
        const result = fetchJson().catch((error: Error) => error)
        await jest.advanceTimersByTimeAsync(15_000)
        expect(await result).toEqual(new Error(genericError))
        if (phase === "dns") {
          resolveDns([publicAddress])
          await jest.advanceTimersByTimeAsync(0)
        }
        expect(mockRequest).toHaveBeenCalledTimes(phase === "dns" ? 0 : 1)
        expect(mockRequest.mock.calls.every(([options]) => options.signal.aborted)).toBe(
          true,
        )
      } finally {
        jest.useRealTimers()
      }
    },
  )
})

describe("LNURL payment library transport integration", () => {
  const fetchInvoice = (lnAddressOrLnurl: string) =>
    LnurlPayService().fetchInvoiceFromLnAddressOrLnurl({
      amount: { amount: 1000n, currency: "BTC" } as BtcPaymentAmount,
      lnAddressOrLnurl,
    })
  const metadata = (callback: string) => ({
    tag: "payRequest",
    callback,
    minSendable: 1000,
    maxSendable: 10000000,
    metadata: JSON.stringify([["text/plain", "test"]]),
  })

  it("blocks an internal discovery address through the real library", async () => {
    mockLookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }])
    const result = await fetchInvoice("alice@metadata.example")
    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect((result as Error).message).toBe(genericError)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it("blocks a private destination encoded as bech32 LNURL", async () => {
    const result = await fetchInvoice(
      "lnurl1dp68gurn8ghj7vfjxuhrqt3s9ccj7urjd9mxzar9l8fw4e",
    )
    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect((result as Error).message).toBe(genericError)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it.each([
    "http://service.example/pay",
    "https://127.0.0.1/pay",
    "https://[::ffff:169.254.169.254]/pay",
  ])("blocks callback %s through the real library", async (callback) => {
    respond(metadata(callback))
    const result = await fetchInvoice("alice@service.example")
    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect((result as Error).message).toBe(genericError)
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it("preserves invoice amount validation", async () => {
    respond(metadata("https://service.example/callback"))
    respond({ pr: "invalid-invoice" })
    const result = await fetchInvoice("alice@service.example")
    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect((result as Error).message).toBe(
      "Lnurl service returned an invoice with an invalid amount",
    )
    expect(mockRequest.mock.calls[1][0].path).toBe("/callback?amount=1000000")
  })

  it.each([
    "alice@service.example",
    "lnurlp://service.example/pay",
    "lnurl1dp68gurn8ghj7um9wfmxjcm99ejhsctdwpkx2tmsv9us9khv69",
  ])("returns a valid invoice for %s through the real library", async (input) => {
    const invoice =
      "lnbc10u1p3w0mf7pp5v9xg3eksnsyrsa3vk5uv00rvye4wf9n0744xgtx0kcrafeanvx7sdqqcqzzgxqyz5vqrzjqwnvuc0u4txn35cafc7w94gxvq5p3cu9dd95f7hlrh0fvs46wpvhddrwgrqy63w5eyqqqqryqqqqthqqpyrzjqw8c7yfutqqy3kz8662fxutjvef7q2ujsxtt45csu0k688lkzu3lddrwgrqy63w5eyqqqqryqqqqthqqpysp53n0sc9hvqgdkrv4ppwrm2pa0gcysa8r2swjkrkjnxkcyrsjmxu4s9qypqsq5zvh7glzpas4l9ptxkdhgefyffkn8humq6amkrhrh2gq02gv8emxrynkwke3uwgf4cfevek89g4020lgldxgusmse79h4caqg30qq2cqmyrc7d"
    respond(metadata("https://service.example/callback"))
    respond({ pr: invoice })
    await expect(fetchInvoice(input)).resolves.toBe(invoice)

    respond(metadata("https://service.example/callback"))
    respond({ status: "ERROR", reason: "private upstream", pr: invoice })
    const result = await fetchInvoice(input)
    expect(result).toBeInstanceOf(ErrorFetchingLnurlInvoice)
    expect((result as Error).message).toBe(genericError)
  })
})
