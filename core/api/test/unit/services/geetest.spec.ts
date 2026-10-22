jest.mock("@/services/tracing", () => ({
  addEventToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

jest.mock("@galoy/gt3-server-node-express-sdk", () => ({
  __mockRegister: jest.fn(),
  __mockLocalRegister: jest.fn(),
  __mockSuccessValidate: jest.fn(),
  __mockFailValidate: jest.fn(),
  // Must mirror the sentinel exported by the vendored SDK.
  VALIDATE_REQUEST_FAILED_MSG: "validate.php request failed (transport error)",
  GeetestLib: class {
    register = jest.requireMock("@galoy/gt3-server-node-express-sdk").__mockRegister
    localRegister = jest.requireMock("@galoy/gt3-server-node-express-sdk")
      .__mockLocalRegister
    successValidate = jest.requireMock("@galoy/gt3-server-node-express-sdk")
      .__mockSuccessValidate
    failValidate = jest.requireMock("@galoy/gt3-server-node-express-sdk")
      .__mockFailValidate
  },
}))

import axios from "axios"
import MockAdapter from "axios-mock-adapter"

import { CacheKeys } from "@/domain/cache"
import {
  CaptchaServiceUnavailableError,
  CaptchaUserFailToPassError,
  UnknownCaptchaError,
} from "@/domain/captcha/errors"
import { LocalCacheService } from "@/services/cache/local-cache"
import Geetest from "@/services/geetest"
import { addEventToCurrentSpan } from "@/services/tracing"

const {
  __mockRegister: mockRegister,
  __mockLocalRegister: mockLocalRegister,
  __mockSuccessValidate: mockSuccessValidate,
  __mockFailValidate: mockFailValidate,
  VALIDATE_REQUEST_FAILED_MSG,
} = jest.requireMock("@galoy/gt3-server-node-express-sdk")

const BYPASS_URL = "https://bypass.geetest.com/v1/bypass_status.php"
const geetest = () => Geetest({ id: "gt-id", key: "gt-key" })

let mock: MockAdapter

beforeAll(() => {
  mock = new MockAdapter(axios)
})

beforeEach(async () => {
  jest.clearAllMocks()
  // The bypass-status cache lives in a module-level NodeCache shared by every
  // LocalCacheService consumer, so it survives between tests.
  await LocalCacheService().clear({ key: CacheKeys.GeetestBypassStatus })
  bypassResponds("success")
  mockRegister.mockResolvedValue({
    status: 1,
    data: JSON.stringify({
      success: 1,
      gt: "gt-id",
      challenge: "challenge",
      new_captcha: true,
    }),
  })
  mockSuccessValidate.mockResolvedValue({ status: 1 })
})

// Both reset first: axios-mock-adapter matches handlers in registration order,
// so a second handler for the same URL would never be reached. Resetting also
// clears request history, which the probe-count assertions below rely on.
const bypassResponds = (status: string) => {
  mock.reset()
  mock.onGet(BYPASS_URL).reply(200, { status })
}
const bypassUnreachable = () => {
  mock.reset()
  mock.onGet(BYPASS_URL).networkError()
}
const bypassProbeCount = () => mock.history.get.filter((r) => r.url === BYPASS_URL).length

// Holds the probe open until released, so a test can pile up concurrent callers
// on a cold cache before the first probe settles.
const bypassRespondsWhenReleased = (status: string) => {
  mock.reset()
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  mock.onGet(BYPASS_URL).reply(async () => {
    await released
    return [200, { status }]
  })
  return release
}

describe("Geetest.register", () => {
  it("registers against the geetest API while bypass status is healthy", async () => {
    bypassResponds("success")

    const res = await geetest().register()

    expect(res).not.toBeInstanceOf(Error)
    expect(mockRegister).toHaveBeenCalledTimes(1)
    expect(mockLocalRegister).not.toHaveBeenCalled()
  })

  it("fails closed instead of minting an offline challenge when geetest is degraded", async () => {
    // localRegister() mints a challenge geetest has never seen, which validate()
    // can only reject — the user solves a captcha and is told they failed it.
    bypassResponds("fail")

    const res = await geetest().register()

    expect(res).toBeInstanceOf(CaptchaServiceUnavailableError)
    expect(mockLocalRegister).not.toHaveBeenCalled()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it("fails closed when the bypass-status endpoint is unreachable", async () => {
    bypassUnreachable()

    expect(await geetest().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
    expect(mockLocalRegister).not.toHaveBeenCalled()
  })

  it("fails closed when register.php fails but the bypass probe reported success", async () => {
    // The SDK resolves normally on a register.php transport failure: status 0
    // with a locally minted challenge (success: 0) geetest has never seen, which
    // validate() can only reject. Returning it would advertise an offline
    // challenge with failbackMode: false.
    bypassResponds("success")
    mockRegister.mockResolvedValue({
      status: 0,
      data: JSON.stringify({
        success: 0,
        gt: "gt-id",
        challenge: "locally-minted",
        new_captcha: true,
      }),
    })

    const res = await geetest().register()

    expect(res).toBeInstanceOf(CaptchaServiceUnavailableError)
  })
})

describe("Geetest.validate", () => {
  it("accepts a challenge the geetest API confirms", async () => {
    expect(await geetest().validate("c", "v", "s")).toBe(true)
    expect(mockSuccessValidate).toHaveBeenCalledTimes(1)
  })

  it("rejects when the geetest API does not confirm the challenge", async () => {
    mockSuccessValidate.mockResolvedValue({ status: 0 })

    expect(await geetest().validate("c", "v", "s")).toBeInstanceOf(
      CaptchaUserFailToPassError,
    )
  })

  it("does not probe bypass status at all", async () => {
    // The probe has no effect on the outcome here — register() is what refuses
    // to start a flow while geetest is degraded — so running it would only put a
    // third-party timeout on the critical path of every code submission.
    await geetest().validate("c", "v", "s")

    expect(bypassProbeCount()).toBe(0)
  })

  it("never falls back to local validation, even with bypass unreachable", async () => {
    // The upstream SDK's failValidate passed any non-empty triple, which opened
    // the captcha gate for anyone whenever bypass.geetest.com was unreachable.
    bypassUnreachable()
    mockSuccessValidate.mockResolvedValue({ status: 0 })

    const res = await geetest().validate("c", "v", "s")

    expect(res).toBeInstanceOf(CaptchaUserFailToPassError)
    expect(mockFailValidate).not.toHaveBeenCalled()
    expect(mockSuccessValidate).toHaveBeenCalledTimes(1)
  })

  it("reports a validate.php transport failure as a provider outage, still failing closed", async () => {
    // validate.php times out — the user did not fail the captcha.
    mockSuccessValidate.mockResolvedValue({
      status: 0,
      msg: VALIDATE_REQUEST_FAILED_MSG,
    })

    const res = await geetest().validate("c", "v", "s")

    expect(res).toBeInstanceOf(CaptchaServiceUnavailableError)
    expect(res).not.toBe(true)
    // The SDK swallows the transport error, so this event is the only trace of
    // the outage beyond the 503.
    expect(addEventToCurrentSpan).toHaveBeenCalledWith("geetestValidateOutage")
  })

  it("keeps reporting a genuine seccode rejection as a user failure", async () => {
    mockSuccessValidate.mockResolvedValue({ status: 0, msg: "极验二次验证不通过" })

    expect(await geetest().validate("c", "v", "s")).toBeInstanceOf(
      CaptchaUserFailToPassError,
    )
    expect(addEventToCurrentSpan).not.toHaveBeenCalledWith("geetestValidateOutage")
  })

  it("returns UnknownCaptchaError when the SDK throws", async () => {
    mockSuccessValidate.mockRejectedValue(new Error("sdk exploded"))

    expect(await geetest().validate("c", "v", "s")).toBeInstanceOf(UnknownCaptchaError)
  })
})

describe("Geetest bypass-status caching", () => {
  it("probes once across repeated registrations inside the cache window", async () => {
    await geetest().register()
    await geetest().register()
    await geetest().register()

    // Without caching, every login-screen load takes a hard dependency on a
    // third-party status endpoint and pays its timeout serially.
    expect(bypassProbeCount()).toBe(1)
    expect(mockRegister).toHaveBeenCalledTimes(3)
  })

  it("caches a degraded verdict too, so an outage is not a probe per request", async () => {
    bypassUnreachable()

    expect(await geetest().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
    expect(await geetest().register()).toBeInstanceOf(CaptchaServiceUnavailableError)

    expect(bypassProbeCount()).toBe(1)
  })

  it("shares one probe between concurrent registrations on a cold cache", async () => {
    // getOrSet only writes the cache once the probe settles, so without sharing
    // the pending probe every request in the burst would miss and probe itself —
    // during an outage, each holding the full timeout.
    const release = bypassRespondsWhenReleased("success")

    const pending = Promise.all(Array.from({ length: 5 }, () => geetest().register()))
    // Let every caller reach the probe before it answers.
    await new Promise((resolve) => setImmediate(resolve))
    expect(bypassProbeCount()).toBe(1)

    release()
    const results = await pending

    results.forEach((res) => expect(res).not.toBeInstanceOf(Error))
    expect(bypassProbeCount()).toBe(1)
    expect(mockRegister).toHaveBeenCalledTimes(5)
  })

  it("probes again once the window expires, recovering from a cached degraded verdict", async () => {
    const start = Date.now()
    const now = jest.spyOn(Date, "now").mockReturnValue(start)
    try {
      bypassResponds("fail")
      expect(await geetest().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
      expect(bypassProbeCount()).toBe(1)

      // Geetest has recovered, but the degraded verdict still holds for the
      // rest of the window. (bypassResponds also resets the probe history.)
      bypassResponds("success")
      now.mockReturnValue(start + 9_000)
      expect(await geetest().register()).toBeInstanceOf(CaptchaServiceUnavailableError)
      expect(bypassProbeCount()).toBe(0)

      now.mockReturnValue(start + 10_001)
      expect(await geetest().register()).not.toBeInstanceOf(Error)
      expect(bypassProbeCount()).toBe(1)

      // The refreshed verdict is cached for a new window.
      now.mockReturnValue(start + 15_000)
      expect(await geetest().register()).not.toBeInstanceOf(Error)
      expect(bypassProbeCount()).toBe(1)
      expect(mockRegister).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
  })
})

describe("Geetest error fallbacks", () => {
  it("register returns UnknownCaptchaError when the SDK throws", async () => {
    bypassResponds("success")
    mockRegister.mockRejectedValue(new Error("sdk exploded"))

    expect(await geetest().register()).toBeInstanceOf(UnknownCaptchaError)
  })
})
