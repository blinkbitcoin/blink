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

import MockAdapter from "axios-mock-adapter"

import {
  BtcMapNotConfiguredError,
  BtcMapSubmitPlaceRejectedError,
  BtcMapUnauthorizedError,
  BtcMapUnavailableError,
  MalformedBtcMapResponseError,
} from "@/domain/btcmap/errors"
import { ErrorLevel } from "@/domain/shared"
import { BtcMapService, client } from "@/services/btcmap"

let mock: MockAdapter

beforeAll(() => {
  mock = new MockAdapter(client)
})

beforeEach(() => {
  mockBtcMapApiUrl = "http://btcmap.test/rpc"
  mockBtcMapApiToken = "test-token"
})

afterEach(() => {
  mock.reset()
})

const btcMapService = (): IBtcMapService => {
  const service = BtcMapService()
  if (service instanceof BtcMapNotConfiguredError) throw service
  return service
}

const baseArgs = {
  externalId: "0123456789abcdef:123e4567-e89b-12d3-a456-426614174000",
  lat: 4.6097,
  lon: -74.0817,
  category: "food" as BtcMapCategory,
  name: "Arepas Place" as BtcMapPlaceName,
}

const validResult = { id: 42, origin: "blink", external_id: baseArgs.externalId }

describe("BtcMapService", () => {
  it("returns BtcMapNotConfiguredError when config is missing", () => {
    for (const missing of ["url", "token"]) {
      mockBtcMapApiUrl = missing === "url" ? undefined : "http://btcmap.test/rpc"
      mockBtcMapApiToken = missing === "token" ? undefined : "test-token"

      const result = BtcMapService()

      expect(result).toBeInstanceOf(BtcMapNotConfiguredError)
      expect((result as BtcMapNotConfiguredError).level).toBe(ErrorLevel.Info)
    }
    expect(mock.history.post.length).toBe(0)
  })

  it("maps the JSON-RPC request correctly", async () => {
    mock.onPost().reply(200, { jsonrpc: "2.0", result: validResult, id: 1 })

    const result = await btcMapService().submitPlace({
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

    await btcMapService().submitPlace(baseArgs)

    const body = JSON.parse(mock.history.post[0].data)
    expect(body.params.extra_fields).toBeUndefined()
  })

  it("returns BtcMapSubmitPlaceRejectedError on a JSON-RPC error", async () => {
    mock.onPost().reply(200, {
      jsonrpc: "2.0",
      error: { code: -32602, message: "invalid params" },
      id: 1,
    })

    const result = await btcMapService().submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapSubmitPlaceRejectedError)
    expect((result as BtcMapSubmitPlaceRejectedError).level).toBe(ErrorLevel.Warn)
  })

  it("returns BtcMapUnavailableError on HTTP failure and retries", async () => {
    mock.onPost().reply(500, "upstream db at db.internal:5432 unavailable")

    const result = await btcMapService().submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapUnavailableError)
    expect((result as BtcMapUnavailableError).level).toBe(ErrorLevel.Critical)
    // axios-retry config: 1 initial attempt + 2 retries
    expect(mock.history.post.length).toBe(3)
  })

  it("returns BtcMapUnauthorizedError on 401 without retrying", async () => {
    mock.onPost().reply(401, "bad token")

    const result = await btcMapService().submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapUnauthorizedError)
    expect((result as BtcMapUnauthorizedError).level).toBe(ErrorLevel.Critical)
    expect(mock.history.post.length).toBe(1)
  })

  it("returns BtcMapUnavailableError on network failure", async () => {
    mock.onPost().networkError()

    const result = await btcMapService().submitPlace(baseArgs)

    expect(result).toBeInstanceOf(BtcMapUnavailableError)
  })

  it("returns MalformedBtcMapResponseError on malformed results", async () => {
    const malformedPayloads = [
      { jsonrpc: "2.0", id: 1 }, // no result
      { jsonrpc: "2.0", result: { origin: "blink" }, id: 1 }, // missing id/external_id
      { jsonrpc: "2.0", result: { ...validResult, id: "42" }, id: 1 }, // wrong id type
      { jsonrpc: "2.0", result: "ok", id: 1 }, // non-object result
    ]

    for (const payload of malformedPayloads) {
      mock.reset()
      mock.onPost().reply(200, payload)

      const result = await btcMapService().submitPlace(baseArgs)

      expect(result).toBeInstanceOf(MalformedBtcMapResponseError)
      expect((result as MalformedBtcMapResponseError).level).toBe(ErrorLevel.Critical)
    }
  })
})
