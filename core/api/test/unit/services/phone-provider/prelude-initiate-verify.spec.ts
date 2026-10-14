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

import { DevicePlatform } from "@/domain/phone-provider"
import { PreludeClient } from "@/services/phone-provider/prelude-service"

const { addAttributesToCurrentSpan: mockAddAttributesToCurrentSpan } = jest.requireMock(
  "@/services/tracing",
) as { addAttributesToCurrentSpan: jest.Mock }

const ip = "203.0.113.7" as IpAddress
const to = "+50365055500" as PhoneNumber
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/605.1.15" as UserAgent

const initiateVerify = (args: {
  userAgent?: UserAgent
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

  it("sends platform and user agent", async () => {
    const result = await initiateVerify({ userAgent, devicePlatform: DevicePlatform.Web })
    expect(result).toBe(true)
    expect(sentSignals()).toStrictEqual({
      ip,
      device_platform: "web",
      user_agent: userAgent,
    })
  })

  it("omits platform when unknown", async () => {
    await initiateVerify({ userAgent })
    expect(sentSignals()).toStrictEqual({ ip, user_agent: userAgent })
  })

  it("omits user agent when absent", async () => {
    await initiateVerify({ devicePlatform: DevicePlatform.Web })
    expect(sentSignals()).toStrictEqual({ ip, device_platform: "web" })
  })

  it("sends only ip without other signals", async () => {
    await initiateVerify({})
    expect(sentSignals()).toStrictEqual({ ip })
  })

  it("records the sent signals on the span", async () => {
    await initiateVerify({ userAgent, devicePlatform: DevicePlatform.Web })
    expect(mockAddAttributesToCurrentSpan).toHaveBeenCalledWith({
      "prelude.signals.devicePlatform": "web",
      "prelude.signals.userAgent": userAgent,
    })
  })
})
