jest.mock("@/config", () => ({
  __mockState: {
    unsecureDefaultLoginCode: false,
    testAccounts: [],
    twilioAccountSid: "AC_live",
  },
  get TWILIO_ACCOUNT_SID() {
    return jest.requireMock("@/config").__mockState.twilioAccountSid
  },
  get UNSECURE_DEFAULT_LOGIN_CODE() {
    return jest.requireMock("@/config").__mockState.unsecureDefaultLoginCode
  },
  getGeetestConfig: jest.fn(() => ({})),
  getTestAccounts: jest.fn(() => jest.requireMock("@/config").__mockState.testAccounts),
  getAccountsOnboardConfig: jest.fn(() => ({
    ipMetadataValidationSettings: { enabled: false },
  })),
}))

jest.mock("@/domain/rate-limit", () => {
  const errors = jest.requireActual("@/domain/rate-limit/errors")
  return {
    RateLimitConfig: {
      requestCodeAttemptPerIp: { key: "request_code_attempt_ip" },
      requestCodeAttemptPerPhoneNumber: { key: "request_phone_number_id" },
      requestCodeAttemptPerAppcheckJti: { key: "request_code_attempt_appcheck_jti" },
      requestCodeCaptchaPerCountry: {
        key: "request_code_captcha_country",
        limits: { points: 5 },
        error: errors.CaptchaRequestCodePerCountryRateLimiterExceededError,
      },
      requestCodeCaptchaGlobal: {
        key: "request_code_captcha_global",
        limits: { points: 30 },
        error: errors.CaptchaRequestCodeGlobalRateLimiterExceededError,
      },
    },
  }
})

jest.mock("@/domain/phone-provider", () => ({
  checkedToChannel: jest.fn(() => "sms"),
  ChannelType: { Sms: "sms", Telegram: "telegram" },
}))

jest.mock("@/services/geetest", () => ({
  __esModule: true,
  __mockValidate: jest.fn(),
  default: () => ({ validate: jest.requireMock("@/services/geetest").__mockValidate }),
}))

jest.mock("@/services/ipfetcher", () => ({ IpFetcher: jest.fn() }))
jest.mock("@/services/kratos", () => ({ AuthWithEmailPasswordlessService: jest.fn() }))

jest.mock("@/services/mongoose", () => ({
  __mockFindByPhone: jest.fn(),
  UsersRepository: () => ({
    findByPhone: jest.requireMock("@/services/mongoose").__mockFindByPhone,
  }),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
  rewardLimiter: jest.fn(),
}))

jest.mock("@/services/phone-provider/twilio-service", () => ({
  TWILIO_ACCOUNT_TEST: "AC_test",
}))

jest.mock("@/services/phone-provider", () => ({
  getPhoneProviderVerifyService: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  addEventToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import {
  requestPhoneCodeWithAppcheckJti,
  requestPhoneCodeWithCaptcha,
} from "@/app/authentication/request-code"
import { InvalidChannel, InvalidPhoneNumber, NotImplementedError } from "@/domain/errors"
import {
  CaptchaRequestCodeGlobalRateLimiterExceededError,
  CaptchaRequestCodePerCountryRateLimiterExceededError,
  UserAttemptPhoneIdentifierRateLimiterExceededError,
  UserCodeAttemptIpRateLimiterExceededError,
} from "@/domain/rate-limit/errors"

const { __mockState: mockConfigState } = jest.requireMock("@/config") as {
  __mockState: {
    unsecureDefaultLoginCode: boolean
    testAccounts: { phone: string; code: string }[]
    twilioAccountSid: string
  }
}

const { checkedToChannel: mockCheckedToChannel } = jest.requireMock(
  "@/domain/phone-provider",
) as { checkedToChannel: jest.Mock }

const { __mockValidate: mockGeetestValidate } = jest.requireMock(
  "@/services/geetest",
) as { __mockValidate: jest.Mock }

const { __mockFindByPhone: mockFindByPhone } = jest.requireMock(
  "@/services/mongoose",
) as { __mockFindByPhone: jest.Mock }

const { consumeLimiter: mockConsumeLimiter, rewardLimiter: mockRewardLimiter } =
  jest.requireMock("@/services/rate-limit") as {
    consumeLimiter: jest.Mock
    rewardLimiter: jest.Mock
  }

const { getPhoneProviderVerifyService: mockGetPhoneProviderVerifyService } =
  jest.requireMock("@/services/phone-provider") as {
    getPhoneProviderVerifyService: jest.Mock
  }

const { addEventToCurrentSpan: mockAddEventToCurrentSpan } = jest.requireMock(
  "@/services/tracing",
) as { addEventToCurrentSpan: jest.Mock }

const COUNTRY_KEY = "request_code_captcha_country"
const GLOBAL_KEY = "request_code_captcha_global"
const IP_KEY = "request_code_attempt_ip"
const PHONE_KEY = "request_phone_number_id"

const PREFIX: Record<string, string> = {
  GT: "+5021234567",
  TJ: "+99291712345",
  JM: "+1876234567",
  US: "+1202234567",
  DE: "+491511234567",
  FR: "+3361234567",
  ES: "+3461234567",
  IT: "+39312345678",
}
const number = (country: string, i: number) => `${PREFIX[country]}${i}`

const mockInitiateVerify = jest.fn()
let buckets: Map<string, number>
let existingPhones: Set<string>

// in-memory stand-in for the redis limiter; only the capped configs carry points
const fakeConsumeLimiter = async ({
  rateLimitConfig,
  keyToConsume,
}: {
  rateLimitConfig: {
    key: string
    limits?: { points: number }
    error?: new () => Error
  }
  keyToConsume: string
}) => {
  if (!rateLimitConfig.limits || !rateLimitConfig.error) return true
  const bucket = `${rateLimitConfig.key}:${keyToConsume}`
  const consumed = (buckets.get(bucket) ?? 0) + 1
  buckets.set(bucket, consumed)
  return consumed > rateLimitConfig.limits.points ? new rateLimitConfig.error() : true
}

const fakeRewardLimiter = async ({
  rateLimitConfig,
  keyToConsume,
}: {
  rateLimitConfig: { key: string }
  keyToConsume: string
}) => {
  const bucket = `${rateLimitConfig.key}:${keyToConsume}`
  buckets.set(bucket, Math.max((buckets.get(bucket) ?? 0) - 1, 0))
  return true
}

const captchaArgs = (phone: string, ip = "127.0.0.1") => ({
  phone: phone as PhoneNumber,
  geetestChallenge: "challenge",
  geetestValidate: "validate",
  geetestSeccode: "seccode",
  ip: ip as IpAddress,
  channel: "sms",
})

const cappedCalls = () =>
  mockConsumeLimiter.mock.calls
    .map(([args]) => args)
    .filter(
      ({ rateLimitConfig }) =>
        rateLimitConfig.key === COUNTRY_KEY || rateLimitConfig.key === GLOBAL_KEY,
    )
    .map(({ rateLimitConfig, keyToConsume }) => [rateLimitConfig.key, keyToConsume])

const sendNumbers = async (country: string, count: number) => {
  for (let i = 0; i < count; i++) {
    const ok = await requestPhoneCodeWithCaptcha(captchaArgs(number(country, i)))
    expect(ok).toBe(true)
  }
}

const resetCallHistory = () => {
  mockConsumeLimiter.mockClear()
  mockInitiateVerify.mockClear()
  mockAddEventToCurrentSpan.mockClear()
}

describe("requestPhoneCodeWithCaptcha code-send caps", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    buckets = new Map()
    existingPhones = new Set()

    mockConfigState.unsecureDefaultLoginCode = false
    mockConfigState.testAccounts = []
    mockConfigState.twilioAccountSid = "AC_live"
    mockCheckedToChannel.mockReturnValue("sms")
    mockGeetestValidate.mockResolvedValue(true)
    mockFindByPhone.mockImplementation(async (phone: string) =>
      existingPhones.has(phone) ? { phone } : new Error("not found"),
    )
    mockConsumeLimiter.mockImplementation(fakeConsumeLimiter)
    mockRewardLimiter.mockImplementation(fakeRewardLimiter)
    mockInitiateVerify.mockResolvedValue(true)
    mockGetPhoneProviderVerifyService.mockReturnValue({
      initiateVerify: mockInitiateVerify,
    })
  })

  it("sends a new number and consumes the ISO country then the global key", async () => {
    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(cappedCalls()).toEqual([
      [COUNTRY_KEY, "GT"],
      [GLOBAL_KEY, "global"],
    ])
    expect(mockAddEventToCurrentSpan).not.toHaveBeenCalled()
  })

  it("blocks the 6th send to a country without consuming the global key", async () => {
    await sendNumbers("GT", 5)
    resetCallHistory()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("GT", 9)))

    expect(result).toBeInstanceOf(CaptchaRequestCodePerCountryRateLimiterExceededError)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([[COUNTRY_KEY, "GT"]])
    expect(buckets.get(`${GLOBAL_KEY}:global`)).toBe(5)
    expect(mockAddEventToCurrentSpan).toHaveBeenCalledWith(
      "captchaRequestCodeCapExceeded",
      { "captcha.cap.scope": "country", "captcha.cap.country": "GT" },
    )
  })

  it("keeps an independent bucket for another country", async () => {
    await sendNumbers("GT", 5)
    await requestPhoneCodeWithCaptcha(captchaArgs(number("GT", 9)))
    resetCallHistory()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+992917123456"))

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(cappedCalls()).toEqual([
      [COUNTRY_KEY, "TJ"],
      [GLOBAL_KEY, "global"],
    ])
  })

  it("keeps separate buckets for countries sharing a calling code", async () => {
    await sendNumbers("JM", 5)
    const capped = await requestPhoneCodeWithCaptcha(captchaArgs(number("JM", 9)))
    expect(capped).toBeInstanceOf(CaptchaRequestCodePerCountryRateLimiterExceededError)
    resetCallHistory()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("US", 0)))

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(buckets.get(`${COUNTRY_KEY}:US`)).toBe(1)
  })

  it("blocks the 31st new-number send across countries on the global cap", async () => {
    for (const country of ["GT", "TJ", "JM", "US", "DE", "FR"]) {
      await sendNumbers(country, 5)
    }
    expect(mockInitiateVerify).toHaveBeenCalledTimes(30)
    resetCallHistory()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("ES", 0)))

    expect(result).toBeInstanceOf(CaptchaRequestCodeGlobalRateLimiterExceededError)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([
      [COUNTRY_KEY, "ES"],
      [GLOBAL_KEY, "global"],
    ])
    expect(mockRewardLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        rateLimitConfig: expect.objectContaining({ key: COUNTRY_KEY }),
        keyToConsume: "ES",
      }),
    )
    expect(buckets.get(`${COUNTRY_KEY}:ES`)).toBe(0)
    expect(mockAddEventToCurrentSpan).toHaveBeenCalledWith(
      "captchaRequestCodeCapExceeded",
      { "captcha.cap.scope": "global", "captcha.cap.country": "ES" },
    )
  })

  it("does not let globally rejected new numbers use up existing users' country capacity", async () => {
    for (const country of ["GT", "TJ", "JM", "US", "DE", "FR"]) {
      await sendNumbers(country, 5)
    }
    for (let i = 0; i < 6; i++) {
      const blocked = await requestPhoneCodeWithCaptcha(captchaArgs(number("IT", i)))
      expect(blocked).toBeInstanceOf(CaptchaRequestCodeGlobalRateLimiterExceededError)
    }
    expect(buckets.get(`${COUNTRY_KEY}:IT`)).toBe(0)
    resetCallHistory()

    existingPhones.add(number("IT", 9))
    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("IT", 9)))

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(buckets.get(`${COUNTRY_KEY}:IT`)).toBe(1)
  })

  it("sends to an existing user when the global cap is full, consuming only the country", async () => {
    for (const country of ["GT", "TJ", "JM", "US", "DE", "FR"]) {
      await sendNumbers(country, 5)
    }
    const blocked = await requestPhoneCodeWithCaptcha(captchaArgs(number("ES", 0)))
    expect(blocked).toBeInstanceOf(CaptchaRequestCodeGlobalRateLimiterExceededError)
    const globalBefore = buckets.get(`${GLOBAL_KEY}:global`)
    resetCallHistory()

    existingPhones.add(number("IT", 0))
    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("IT", 0)))

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(mockInitiateVerify).toHaveBeenCalledWith(
      expect.objectContaining({ phoneExists: true }),
    )
    expect(cappedCalls()).toEqual([[COUNTRY_KEY, "IT"]])
    expect(buckets.get(`${GLOBAL_KEY}:global`)).toBe(globalBefore)
    expect(mockAddEventToCurrentSpan).not.toHaveBeenCalled()
  })

  it("still applies the country cap to existing users", async () => {
    existingPhones = new Set([0, 1, 2, 3, 4, 5].map((i) => number("GT", i)))
    await sendNumbers("GT", 5)
    resetCallHistory()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs(number("GT", 5)))

    expect(result).toBeInstanceOf(CaptchaRequestCodePerCountryRateLimiterExceededError)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(buckets.get(`${GLOBAL_KEY}:global`)).toBeUndefined()
  })

  it("rejects a number with no country before consuming the caps", async () => {
    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+000"))

    expect(result).toBeInstanceOf(InvalidPhoneNumber)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([])
  })

  it("does not consume the caps when GeeTest rejects the challenge", async () => {
    const geetestError = new Error("geetest rejected")
    mockGeetestValidate.mockResolvedValue(geetestError)

    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

    expect(result).toBe(geetestError)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([])
  })

  it.each([
    ["per-IP", IP_KEY, UserCodeAttemptIpRateLimiterExceededError],
    ["per-phone", PHONE_KEY, UserAttemptPhoneIdentifierRateLimiterExceededError],
  ])(
    "does not consume the caps when the %s limiter trips",
    async (_label, trippedKey, ErrorClass) => {
      mockConsumeLimiter.mockImplementation(async (args) =>
        args.rateLimitConfig.key === trippedKey
          ? new ErrorClass()
          : fakeConsumeLimiter(args),
      )

      const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

      expect(result).toBeInstanceOf(ErrorClass)
      expect(mockInitiateVerify).not.toHaveBeenCalled()
      expect(cappedCalls()).toEqual([])
    },
  )

  const channelError = new Error("invalid channel")
  const providerError = new Error("no provider")

  it.each([
    [
      "checkedToChannel returns an error",
      () => mockCheckedToChannel.mockReturnValue(channelError),
      (result: unknown) => expect(result).toBe(channelError),
    ],
    [
      "the channel is telegram",
      () => mockCheckedToChannel.mockReturnValue("telegram"),
      (result: unknown) => expect(result).toBeInstanceOf(InvalidChannel),
    ],
    [
      "the phone provider is unavailable",
      () => mockGetPhoneProviderVerifyService.mockReturnValue(providerError),
      (result: unknown) => expect(result).toBe(providerError),
    ],
    [
      "the twilio account is the test account",
      () => {
        mockConfigState.twilioAccountSid = "AC_test"
      },
      (result: unknown) => expect(result).toBeInstanceOf(NotImplementedError),
    ],
  ])("does not consume the caps when %s", async (_label, arrange, assertResult) => {
    arrange()

    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

    assertResult(result)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([])
  })

  it("does not consume the caps for a test account", async () => {
    mockConfigState.testAccounts = [{ phone: "+50212345678", code: "123456" }]

    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

    expect(result).toBe(true)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([])
  })

  it("does not consume the caps when UNSECURE_DEFAULT_LOGIN_CODE is set", async () => {
    mockConfigState.unsecureDefaultLoginCode = true

    const result = await requestPhoneCodeWithCaptcha(captchaArgs("+50212345678"))

    expect(result).toBe(true)
    expect(mockInitiateVerify).not.toHaveBeenCalled()
    expect(cappedCalls()).toEqual([])
  })

  it("never consumes the caps on the AppCheck path", async () => {
    const result = await requestPhoneCodeWithAppcheckJti({
      phone: "+50212345678" as PhoneNumber,
      ip: "127.0.0.1" as IpAddress,
      channel: "sms",
      appcheckJti: "jti",
    })

    expect(result).toBe(true)
    expect(mockInitiateVerify).toHaveBeenCalledTimes(1)
    expect(cappedCalls()).toEqual([])
  })
})
