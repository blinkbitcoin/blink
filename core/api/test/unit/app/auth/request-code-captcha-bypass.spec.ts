import { CaptchaUserFailToPassError } from "@/domain/captcha/errors"

// Mock functions declared at module scope — jest.fn() calls are hoisted.
const mockGetTestAccountsCaptcha = jest.fn()
const mockGetGeetestConfig = jest.fn()
const mockGetTestAccounts = jest.fn()
const mockGetAccountsOnboardConfig = jest.fn()
const mockGeetestValidate = jest.fn()
const mockConsumeLimiter = jest.fn()
const mockAddAttributesToCurrentSpan = jest.fn()
const mockRecordExceptionInCurrentSpan = jest.fn()

jest.mock("@/config", () => {
  // Inline rate limit defaults — cannot reference outer const due to jest.mock hoisting
  const rl = { points: 10, duration: 3600, blockDuration: 3600 }
  return {
    getTestAccountsCaptcha: (...args: unknown[]) => mockGetTestAccountsCaptcha(...args),
    getGeetestConfig: (...args: unknown[]) => mockGetGeetestConfig(...args),
    getTestAccounts: (...args: unknown[]) => mockGetTestAccounts(...args),
    getAccountsOnboardConfig: (...args: unknown[]) =>
      mockGetAccountsOnboardConfig(...args),
    getRequestCodePerEmailLimits: () => rl,
    getRequestCodePerPhoneNumberLimits: () => rl,
    getRequestCodePerIpLimits: () => rl,
    getRequestTelegramPassportNoncePerPhoneNumberLimits: () => rl,
    getRequestTelegramPassportNoncePerIpLimits: () => rl,
    getLoginAttemptPerLoginIdentifierLimits: () => rl,
    getFailedLoginAttemptPerIpLimits: () => rl,
    getInvoiceCreateAttemptLimits: () => rl,
    getInvoiceCreateForRecipientAttemptLimits: () => rl,
    getOnChainAddressCreateAttemptLimits: () => rl,
    getDeviceAccountCreateAttemptLimits: () => rl,
    getAppcheckJtiAttemptLimits: () => rl,
    getAddQuizPerIpLimits: () => rl,
    getAddQuizPerPhoneLimits: () => rl,
    getSmsAuthUnsupportedCountries: () => [],
    getWhatsAppAuthUnsupportedCountries: () => [],
    getTelegramAuthUnsupportedCountries: () => [],
    TWILIO_ACCOUNT_SID: "test-sid",
    UNSECURE_DEFAULT_LOGIN_CODE: undefined,
  }
})

jest.mock("@/services/geetest", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    validate: (...args: unknown[]) => mockGeetestValidate(...args),
  })),
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: (...args: unknown[]) => mockConsumeLimiter(...args),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(() => ({
    findByPhone: jest.fn(() => new Error("not found")),
  })),
}))

jest.mock("@/services/phone-provider", () => ({
  getPhoneProviderVerifyService: jest.fn(() => ({
    initiateVerify: jest.fn(() => true),
  })),
}))

jest.mock("@/services/phone-provider/twilio-service", () => ({
  TWILIO_ACCOUNT_TEST: "twilio-test-sid",
}))

jest.mock("@/services/ipfetcher", () => ({
  IpFetcher: jest.fn(() => ({
    fetchIPInfo: jest.fn(() => ({})),
  })),
}))

jest.mock("@/services/logger", () => ({
  __esModule: true,
  baseLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: (...args: unknown[]) =>
    mockAddAttributesToCurrentSpan(...args),
  recordExceptionInCurrentSpan: (...args: unknown[]) =>
    mockRecordExceptionInCurrentSpan(...args),
}))

jest.mock("@/services/kratos", () => ({
  AuthWithEmailPasswordlessService: jest.fn(),
}))

import { requestPhoneCodeWithCaptcha } from "@/app/authentication/request-code"
import { baseLogger } from "@/services/logger"

const testPhone = "+16505551234" as PhoneNumber
const otherPhone = "+16505559999" as PhoneNumber
const testIp = "127.0.0.1" as IpAddress

const baseCaptchaArgs = {
  geetestChallenge: "test-challenge",
  geetestValidate: "test-validate",
  geetestSeccode: "test-seccode",
  ip: testIp,
  channel: "sms",
}

beforeEach(() => {
  jest.clearAllMocks()

  mockGetGeetestConfig.mockReturnValue({ id: "test-id", key: "test-key" })
  mockGetTestAccounts.mockReturnValue([])
  mockGetTestAccountsCaptcha.mockReturnValue([])
  mockGetAccountsOnboardConfig.mockReturnValue({
    phoneMetadataValidationSettings: { enabled: false },
    ipMetadataValidationSettings: { enabled: false },
  })
  mockConsumeLimiter.mockResolvedValue(true)
  mockGeetestValidate.mockResolvedValue(true)
})

describe("requestPhoneCodeWithCaptcha - CAPTCHA bypass for test accounts", () => {
  describe("when phone IS in test_accounts_captcha", () => {
    beforeEach(() => {
      mockGetTestAccountsCaptcha.mockReturnValue([{ phone: testPhone }])
    })

    it("skips CAPTCHA validation and does not call Geetest.validate", async () => {
      const result = await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(result).not.toBeInstanceOf(Error)
      expect(mockGeetestValidate).not.toHaveBeenCalled()
    })

    it("proceeds to rate limiting after skipping CAPTCHA", async () => {
      await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(mockConsumeLimiter).toHaveBeenCalled()
    })

    it("logs that CAPTCHA is being skipped", async () => {
      await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(baseLogger.info).toHaveBeenCalledWith(
        { phone: testPhone },
        "Skipping CAPTCHA validation for test account",
      )
    })

    it("sets tracing attributes when CAPTCHA is skipped", async () => {
      await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(mockAddAttributesToCurrentSpan).toHaveBeenCalledWith({
        "requestCode.captchaSkipped": true,
      })
    })
  })

  describe("when phone is NOT in test_accounts_captcha", () => {
    beforeEach(() => {
      mockGetTestAccountsCaptcha.mockReturnValue([{ phone: otherPhone }])
    })

    it("validates CAPTCHA normally via Geetest.validate", async () => {
      await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(mockGeetestValidate).toHaveBeenCalledWith(
        "test-challenge",
        "test-validate",
        "test-seccode",
      )
    })

    it("returns error when CAPTCHA validation fails", async () => {
      const captchaError = new CaptchaUserFailToPassError()
      mockGeetestValidate.mockResolvedValue(captchaError)

      const result = await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(result).toBeInstanceOf(CaptchaUserFailToPassError)
    })
  })

  describe("when test_accounts_captcha is empty", () => {
    beforeEach(() => {
      mockGetTestAccountsCaptcha.mockReturnValue([])
    })

    it("validates CAPTCHA normally via Geetest.validate", async () => {
      await requestPhoneCodeWithCaptcha({
        phone: testPhone,
        ...baseCaptchaArgs,
      })

      expect(mockGeetestValidate).toHaveBeenCalledWith(
        "test-challenge",
        "test-validate",
        "test-seccode",
      )
    })
  })
})
