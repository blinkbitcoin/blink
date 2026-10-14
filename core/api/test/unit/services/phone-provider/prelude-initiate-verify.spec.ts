const mockVerificationCreate = jest.fn()
const mockLookup = jest.fn()

jest.mock("@prelude.so/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    verification: { create: mockVerificationCreate },
    lookup: { lookup: mockLookup },
  })),
}))

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  PRELUDE_API_KEY: "test_prelude_key",
}))

jest.mock("@/services/tracing", () => ({
  ...jest.requireActual("@/services/tracing"),
  wrapAsyncFunctionsToRunInSpan: jest.fn(({ fns }) => fns),
  addAttributesToCurrentSpan: jest.fn(),
}))

import { DevicePlatform, USER_AGENT_MAX_LENGTH } from "@/domain/phone-provider"
import { PreludeClient } from "@/services/phone-provider/prelude-service"

const { addAttributesToCurrentSpan: mockAddAttributesToCurrentSpan } = jest.requireMock(
  "@/services/tracing",
) as { addAttributesToCurrentSpan: jest.Mock }

const ip = "203.0.113.7" as IpAddress
const to = "+50365055500" as PhoneNumber
const browserUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/605.1.15"
const appUa = "Blink/2.4.0 okhttp/4.12.0"

const initiateVerify = (args: {
  userAgent?: string
  devicePlatform?: DevicePlatform
}) => {
  const client = PreludeClient()
  if (client instanceof Error) throw client
  return client.initiateVerify({
    to,
    channel: "sms",
    phoneExists: true,
    ip,
    ...args,
  })
}

const sentSignals = () => {
  expect(mockVerificationCreate).toHaveBeenCalledTimes(1)
  return mockVerificationCreate.mock.calls[0][0].signals
}

describe("PreludeClient.initiateVerify signals", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockVerificationCreate.mockResolvedValue({ status: "success" })
  })

  it("web login via consent: web platform and browser UA", async () => {
    const result = await initiateVerify({
      userAgent: browserUa,
      devicePlatform: DevicePlatform.Web,
    })
    expect(result).toBe(true)
    expect(sentSignals()).toStrictEqual({
      ip,
      device_platform: "web",
      user_agent: browserUa,
    })
  })

  it("bot on REST /phone/code: web platform and its own UA", async () => {
    await initiateVerify({ userAgent: "curl/8.10.1", devicePlatform: DevicePlatform.Web })
    expect(sentSignals()).toStrictEqual({
      ip,
      device_platform: "web",
      user_agent: "curl/8.10.1",
    })
  })

  it("app on REST /phone/code-appcheck: no platform", async () => {
    await initiateVerify({ userAgent: appUa })
    expect(sentSignals()).toStrictEqual({ ip, user_agent: appUa })
  })

  it.each([undefined, "", "   "])("no UA %p: user_agent omitted", async (userAgent) => {
    await initiateVerify({ userAgent, devicePlatform: DevicePlatform.Web })
    expect(sentSignals()).toStrictEqual({ ip, device_platform: "web" })
  })

  it("no UA and no platform: only ip", async () => {
    await initiateVerify({})
    expect(sentSignals()).toStrictEqual({ ip })
  })

  it("oversized UA: truncated to the cap", async () => {
    await initiateVerify({ userAgent: " " + "x".repeat(USER_AGENT_MAX_LENGTH + 100) })
    expect(sentSignals()).toStrictEqual({
      ip,
      user_agent: "x".repeat(USER_AGENT_MAX_LENGTH),
    })
  })

  it("records the sent signals on the span", async () => {
    await initiateVerify({ userAgent: browserUa, devicePlatform: DevicePlatform.Web })
    expect(mockAddAttributesToCurrentSpan).toHaveBeenCalledWith({
      "prelude.signals.devicePlatform": "web",
      "prelude.signals.userAgent": browserUa,
    })
  })

  it("keeps target and options unchanged", async () => {
    await initiateVerify({ userAgent: appUa })
    expect(mockVerificationCreate).toHaveBeenCalledWith({
      target: { type: "phone_number", value: to },
      options: { preferred_channel: "sms" },
      signals: { ip, user_agent: appUa },
    })
  })
})
