// Exercise the vendored SDK, not a replacement of its register/validate methods.
// Only HTTP and tracing are mocked so transport failures run the real SDK paths.
jest.mock("axios", () => jest.fn())
jest.mock("@/services/tracing", () => ({
  addEventToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import axios from "axios"
import {
  GeetestLib,
  GeetestLibResult,
  VALIDATE_REQUEST_FAILED_MSG,
} from "@galoy/gt3-server-node-express-sdk"

import { CacheKeys } from "@/domain/cache"
import {
  CaptchaServiceUnavailableError,
  CaptchaUserFailToPassError,
} from "@/domain/captcha/errors"
import { LocalCacheService } from "@/services/cache/local-cache"
import Geetest from "@/services/geetest"

const http = axios as unknown as jest.Mock
const REGISTER_URL = "http://api.geetest.com/register.php"
const VALIDATE_URL = "http://api.geetest.com/validate.php"
const BYPASS_URL = "https://bypass.geetest.com/v1/bypass_status.php"
const service = () => Geetest({ id: "gt-id", key: "gt-key" })
const sdk = () => new GeetestLib("gt-id", "gt-key")

beforeEach(async () => {
  http.mockReset()
  jest.spyOn(console, "log").mockImplementation(() => undefined)
  await LocalCacheService().clear({ key: CacheKeys.GeetestBypassStatus })
})

afterEach(() => jest.restoreAllMocks())

describe("vendored Geetest SDK validation", () => {
  it("exports the sentinel actually returned after a network failure", async () => {
    http.mockRejectedValue(new Error("connection refused"))

    const result = await sdk().successValidate("c", "v", "s", [])

    expect(typeof VALIDATE_REQUEST_FAILED_MSG).toBe("string")
    expect(VALIDATE_REQUEST_FAILED_MSG).not.toBe("")
    expect(result).toMatchObject({ status: 0, msg: VALIDATE_REQUEST_FAILED_MSG })
    expect(http).toHaveBeenCalledWith({
      url: VALIDATE_URL,
      method: "POST",
      timeout: 5000,
      data: expect.any(String),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
    const body = new URLSearchParams(http.mock.calls[0][0].data)
    expect(body.get("captchaid")).toBe("gt-id")
    expect(body.get("challenge")).toBe("c")
    expect(body.get("seccode")).toBe("s")
    expect(await service().validate("c", "v", "s")).toBeInstanceOf(
      CaptchaServiceUnavailableError,
    )
  })

  it.each([429, 500, 503])(
    "fails closed on a resolved HTTP %s response",
    async (status) => {
      // Cover the explicit non-200 branch even if axios normally rejects 5xx.
      http.mockResolvedValue({ status, data: { seccode: "confirmed" } })

      expect(await sdk().successValidate("c", "v", "s", [])).toMatchObject({
        status: 0,
        msg: VALIDATE_REQUEST_FAILED_MSG,
      })
      expect(await service().validate("c", "v", "s")).toBeInstanceOf(
        CaptchaServiceUnavailableError,
      )
    },
  )

  it("classifies an axios-rejected 503 as a provider outage", async () => {
    http.mockRejectedValue(
      Object.assign(new Error("HTTP 503"), { response: { status: 503 } }),
    )

    expect(await service().validate("c", "v", "s")).toBeInstanceOf(
      CaptchaServiceUnavailableError,
    )
  })

  it.each(["false", "", undefined])(
    "keeps seccode %s distinct from an outage",
    async (seccode) => {
      http.mockResolvedValue({ status: 200, data: { seccode } })

      const result = await sdk().successValidate("c", "v", "s", [])

      expect(result.status).toBe(0)
      expect(result.msg).not.toBe(VALIDATE_REQUEST_FAILED_MSG)
      expect(await service().validate("c", "v", "s")).toBeInstanceOf(
        CaptchaUserFailToPassError,
      )
    },
  )

  it("accepts a provider-confirmed seccode without a bypass probe", async () => {
    http.mockResolvedValue({ status: 200, data: { seccode: "confirmed" } })

    expect(await service().validate("c", "v", "s")).toBe(true)
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0][0].url).toBe(VALIDATE_URL)
  })

  it("rejects empty validation input without HTTP", async () => {
    expect(await service().validate("", "v", "s")).toBeInstanceOf(
      CaptchaUserFailToPassError,
    )
    expect(http).not.toHaveBeenCalled()
  })

  it.each([
    ["c", "v", "s"],
    ["", "", ""],
  ])("never authorizes the SDK outage fallback (%s, %s, %s)", (c, v, s) => {
    // This defensive API is intentionally absent from the service's minimal types.
    const lib = sdk() as GeetestLib & {
      failValidate(c: string, v: string, s: string): GeetestLibResult
    }
    expect(lib.failValidate(c, v, s).status).toBe(0)
    expect(http).not.toHaveBeenCalled()
  })
})

describe("service registration through the real SDK", () => {
  it.each([
    { status: 503, data: { status: "success" } },
    { status: 200, data: null },
    { status: 200, data: {} },
    { status: 200, data: { status: 1 } },
  ])("fails closed on an unusable bypass response: %j", async (response) => {
    http.mockResolvedValue(response)

    expect(await service().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0][0].url).toBe(BYPASS_URL)
  })

  it.each(["network", "http-503", "zero-challenge", "missing-challenge"])(
    "does not return an offline challenge after %s",
    async (failure) => {
      http.mockImplementation(async ({ url }) => {
        if (url === BYPASS_URL) return { status: 200, data: { status: "success" } }
        if (url !== REGISTER_URL) throw new Error(`Unexpected request: ${url}`)
        if (failure === "network") throw new Error("network unreachable")
        if (failure === "http-503") return { status: 503, data: {} }
        return {
          status: 200,
          data: failure === "zero-challenge" ? { challenge: "0" } : {},
        }
      })

      expect(await service().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
      expect(http).toHaveBeenCalledTimes(2)
      expect(http.mock.calls[1][0]).toMatchObject({
        url: REGISTER_URL,
        method: "GET",
        timeout: 5000,
        params: { gt: "gt-id", digestmod: "md5", client_type: "native" },
      })
    },
  )

  it("returns an online challenge when both provider endpoints are healthy", async () => {
    http.mockImplementation(async ({ url }) => {
      if (url === BYPASS_URL) return { status: 200, data: { status: "success" } }
      if (url === REGISTER_URL)
        return { status: 200, data: { challenge: "provider-challenge" } }
      throw new Error(`Unexpected request: ${url}`)
    })

    expect(await service().register()).toEqual({
      success: 1,
      gt: "gt-id",
      challenge: expect.stringMatching(/^[0-9a-f]{32}$/),
      newCaptcha: true,
    })
    expect(http).toHaveBeenCalledTimes(2)
  })
})
