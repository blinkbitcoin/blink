let mockBtcMapApiUrl: string | undefined = "http://btcmap.test/rpc"
let mockBtcMapApiToken: string | undefined = "test-token"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  get BTCMAP_API_URL() {
    return mockBtcMapApiUrl
  },
  get BTCMAP_API_TOKEN() {
    return mockBtcMapApiToken
  },
}))

jest.mock("axios", () => {
  const actual = jest.requireActual("axios")
  const instance = actual.create()
  return {
    ...actual,
    default: { ...actual.default, create: () => instance },
    create: () => instance,
  }
})

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import MockAdapter from "axios-mock-adapter"

import { create as createAxiosInstance } from "axios"

import { BtcMapSubmitPlaceError } from "@/domain/btcmap/errors"
import { ErrorLevel } from "@/domain/shared"
import { submitPlace } from "@/services/btcmap"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

// the axios mock above makes every `create()` return the same instance
// the service builds its client from
const client = createAxiosInstance()
const mock = new MockAdapter(client)

const baseArgs = {
  externalId: "0123456789abcdef:2fd89242-816f-4958-a42d-56b363e766a0",
  lat: 4.6097,
  lon: -74.0817,
  category: "food",
  name: "Arepas Place",
}

const validResult = { id: 42, origin: "blink", external_id: baseArgs.externalId }

const lastTracedLevel = () =>
  mockRecordException.mock.calls.length > 0
    ? mockRecordException.mock.calls[mockRecordException.mock.calls.length - 1][0].level
    : undefined

describe("btcmap service - submitPlace", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mock.reset()
    mockBtcMapApiUrl = "http://btcmap.test/rpc"
    mockBtcMapApiToken = "test-token"
  })

  it("fails fast with a generic message when config is missing", async () => {
    for (const missing of ["url", "token"]) {
      mockBtcMapApiUrl = missing === "url" ? undefined : "http://btcmap.test/rpc"
      mockBtcMapApiToken = missing === "token" ? undefined : "test-token"

      const result = await submitPlace(baseArgs)

      expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
      expect((result as BtcMapSubmitPlaceError).message).toBe(
        "btcmap service not configured",
      )
      expect(lastTracedLevel()).toBe(ErrorLevel.Critical)
    }
    expect(mock.history.post.length).toBe(0)
  })

  it("maps the JSON-RPC request correctly", async () => {
    mock.onPost().reply(200, { jsonrpc: "2.0", result: validResult, id: 1 })

    const result = await submitPlace({
      ...baseArgs,
      extraFields: { "osm:amenity": "restaurant" },
    })

    expect(result).toEqual(validResult)
    expect(mock.history.post.length).toBe(1)

    const request = mock.history.post[0]
    expect(request.url).toBe("http://btcmap.test/rpc")
    expect(request.headers?.Authorization).toBe("Bearer test-token")

    const body = JSON.parse(request.data)
    expect(body).toEqual({
      jsonrpc: "2.0",
      method: "submit_place",
      params: {
        origin: "blink",
        external_id: baseArgs.externalId,
        lat: baseArgs.lat,
        lon: baseArgs.lon,
        category: baseArgs.category,
        name: baseArgs.name,
        extra_fields: { "osm:amenity": "restaurant" },
      },
      id: 1,
    })
  })

  it("omits extra_fields when extraFields is not provided", async () => {
    mock.onPost().reply(200, { jsonrpc: "2.0", result: validResult, id: 1 })

    await submitPlace(baseArgs)

    const body = JSON.parse(mock.history.post[0].data)
    expect(body.params.extra_fields).toBeUndefined()
  })

  it("returns a generic error on JSON-RPC error without leaking upstream text", async () => {
    mock.onPost().reply(200, {
      jsonrpc: "2.0",
      error: { code: -32602, message: "invalid params near 10.0.0.1:8000" },
      id: 1,
    })

    const result = await submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
    expect((result as BtcMapSubmitPlaceError).message).toBe("place submission failed")
    expect((result as BtcMapSubmitPlaceError).message).not.toContain("10.0.0.1")
    expect(lastTracedLevel()).toBe(ErrorLevel.Warn)
  })

  it("returns a generic error on HTTP failure without leaking upstream text", async () => {
    mock.onPost().reply(500, "upstream db at db.internal:5432 unavailable")

    const result = await submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
    expect((result as BtcMapSubmitPlaceError).message).toBe("place submission failed")
    expect((result as BtcMapSubmitPlaceError).message).not.toContain("db.internal")
    expect(lastTracedLevel()).toBe(ErrorLevel.Critical)
  })

  it("returns a generic error on network failure", async () => {
    mock.onPost().networkError()

    const result = await submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
    expect((result as BtcMapSubmitPlaceError).message).toBe("place submission failed")
    expect(lastTracedLevel()).toBe(ErrorLevel.Critical)
  })

  it("returns a generic error on malformed results", async () => {
    const malformedPayloads = [
      { jsonrpc: "2.0", id: 1 }, // no result
      { jsonrpc: "2.0", result: { origin: "blink" }, id: 1 }, // missing id/external_id
      { jsonrpc: "2.0", result: { ...validResult, id: "42" }, id: 1 }, // wrong id type
      { jsonrpc: "2.0", result: "ok", id: 1 }, // non-object result
    ]

    for (const payload of malformedPayloads) {
      mock.reset()
      mock.onPost().reply(200, payload)

      const result = await submitPlace(baseArgs)

      expect(result).toBeInstanceOf(BtcMapSubmitPlaceError)
      expect((result as BtcMapSubmitPlaceError).message).toBe("place submission failed")
    }
  })
})
