import {
  getPhoneProviderVerifyService,
  getPhoneProviderTransactionalService,
  isPhoneCodeValid,
} from "@/services/phone-provider"
import { PhoneProviderConfigError } from "@/config/error"

// Mock config
jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getPhoneProviderConfig: jest.fn(),
  TWILIO_ACCOUNT_SID: "test_account_sid",
  TWILIO_AUTH_TOKEN: "test_auth_token",
  TWILIO_VERIFY_SERVICE_ID: "test_verify_service",
  TWILIO_MESSAGING_SERVICE_ID: "test_messaging_service",
  PRELUDE_API_KEY: "test_prelude_key",
  UNSECURE_DEFAULT_LOGIN_CODE: "000000" as PhoneCode,
  getTestAccounts: jest.fn(),
}))

// Mock phone provider services
jest.mock("@/services/phone-provider/twilio-service", () => ({
  TwilioClient: jest.fn(),
  TWILIO_ACCOUNT_TEST: "AC_twilio_id",
}))

jest.mock("@/services/phone-provider/prelude-service", () => ({
  PreludeClient: jest.fn(),
}))

// Mock domain modules
jest.mock("@/domain/accounts/test-accounts-checker", () => ({
  TestAccountsChecker: jest.fn(),
}))

jest.mock("@/domain/phone-provider", () => ({
  ...jest.requireActual("@/domain/phone-provider"),
  PhoneCodeInvalidError: jest.requireActual("@/domain/phone-provider")
    .PhoneCodeInvalidError,
}))

jest.mock("@/domain/errors", () => ({
  ...jest.requireActual("@/domain/errors"),
  NotImplementedError: jest.requireActual("@/domain/errors").NotImplementedError,
}))

import { getPhoneProviderConfig, getTestAccounts } from "@/config"
import { TwilioClient } from "@/services/phone-provider/twilio-service"
import { PreludeClient } from "@/services/phone-provider/prelude-service"
import { TestAccountsChecker } from "@/domain/accounts/test-accounts-checker"
import { PhoneCodeInvalidError } from "@/domain/phone-provider"

const mockGetPhoneProviderConfig = getPhoneProviderConfig as jest.MockedFunction<
  typeof getPhoneProviderConfig
>
const mockTwilioClient = TwilioClient as jest.MockedFunction<typeof TwilioClient>
const mockPreludeClient = PreludeClient as jest.MockedFunction<typeof PreludeClient>
const mockGetTestAccounts = getTestAccounts as jest.MockedFunction<typeof getTestAccounts>
const mockTestAccountsChecker = TestAccountsChecker as jest.MockedFunction<
  typeof TestAccountsChecker
>

describe("Phone Provider Factory", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("getPhoneProviderVerifyService", () => {
    it("returns Twilio service when configured", () => {
      const mockTwilioService: IPhoneProviderService = {
        sendTemplatedSMS: jest.fn(),
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(mockTwilioService)

      const result = getPhoneProviderVerifyService()

      expect(result).toBe(mockTwilioService)
      expect(mockTwilioClient).toHaveBeenCalledTimes(1)
    })

    it("returns Prelude service when configured", () => {
      const mockPreludeService: IPhoneProviderVerifyService = {
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockPreludeClient.mockReturnValue(mockPreludeService)

      const result = getPhoneProviderVerifyService()

      expect(result).toBe(mockPreludeService)
      expect(mockPreludeClient).toHaveBeenCalledTimes(1)
    })

    it("returns error for unsupported provider", () => {
      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "invalid-provider" as "twilio",
        transactional: "twilio",
      })

      const result = getPhoneProviderVerifyService()

      expect(result).toBeInstanceOf(PhoneProviderConfigError)
      expect((result as PhoneProviderConfigError<unknown>).message).toContain(
        "Unsupported verify provider: invalid-provider",
      )
    })

    it("returns error when provider factory returns config error", () => {
      const configError = new PhoneProviderConfigError("API key missing")

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockPreludeClient.mockReturnValue(configError)

      const result = getPhoneProviderVerifyService()

      expect(result).toBe(configError)
    })

    it("returns error when provider lacks verify capabilities", () => {
      const mockIncompleteService = {
        // Missing verify capabilities
        sendTemplatedSMS: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(
        mockIncompleteService as unknown as IPhoneProviderService,
      )

      const result = getPhoneProviderVerifyService()

      expect(result).toBeInstanceOf(PhoneProviderConfigError)
      expect((result as PhoneProviderConfigError<unknown>).message).toContain(
        "Provider 'twilio' does not support verify operations",
      )
    })
  })

  describe("getPhoneProviderTransactionalService", () => {
    it("returns Twilio service when configured", () => {
      const mockTwilioService: IPhoneProviderService = {
        sendTemplatedSMS: jest.fn(),
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(mockTwilioService)

      const result = getPhoneProviderTransactionalService()

      expect(result).toBe(mockTwilioService)
      expect(mockTwilioClient).toHaveBeenCalledTimes(1)
    })

    it("returns error for unsupported provider", () => {
      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "invalid-provider" as "twilio",
      })

      const result = getPhoneProviderTransactionalService()

      expect(result).toBeInstanceOf(PhoneProviderConfigError)
      expect((result as PhoneProviderConfigError<unknown>).message).toContain(
        "Unsupported transactional provider: invalid-provider",
      )
    })

    it("returns error when provider factory returns config error", () => {
      const configError = new PhoneProviderConfigError("API key missing")

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(configError)

      const result = getPhoneProviderTransactionalService()

      expect(result).toBe(configError)
    })

    it("returns error when provider lacks transactional capabilities", () => {
      const mockIncompleteService = {
        // Missing sendTemplatedSMS capability
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(
        mockIncompleteService as unknown as IPhoneProviderService,
      )

      const result = getPhoneProviderTransactionalService()

      expect(result).toBeInstanceOf(PhoneProviderConfigError)
      expect((result as PhoneProviderConfigError<unknown>).message).toContain(
        "Provider 'twilio' does not support transactional SMS operations",
      )
    })

    it("handles Prelude provider that doesn't support transactional SMS", () => {
      const mockPreludeService: IPhoneProviderVerifyService = {
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
        // No sendTemplatedSMS method
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "prelude",
      })
      mockPreludeClient.mockReturnValue(mockPreludeService)

      const result = getPhoneProviderTransactionalService()

      expect(result).toBeInstanceOf(PhoneProviderConfigError)
      expect((result as PhoneProviderConfigError<unknown>).message).toContain(
        "Provider 'prelude' does not support transactional SMS operations",
      )
    })
  })

  describe("capability validation", () => {
    it("validates verify capabilities correctly", () => {
      const validVerifyService: IPhoneProviderService = {
        sendTemplatedSMS: jest.fn(),
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(validVerifyService)

      const result = getPhoneProviderVerifyService()

      expect(result).toBe(validVerifyService)
    })

    it("validates transactional capabilities correctly", () => {
      const validTransactionalService: IPhoneProviderTransactionalService = {
        sendTemplatedSMS: jest.fn(),
      }

      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(validTransactionalService as IPhoneProviderService)

      const result = getPhoneProviderTransactionalService()

      expect(result).toBe(validTransactionalService)
    })
  })

  describe("isPhoneCodeValid", () => {
    const testPhone = "+1234567890" as PhoneNumber
    const testCode = "123456" as PhoneCode
    const defaultCode = "000000" as PhoneCode

    beforeEach(() => {
      // Reset TWILIO_ACCOUNT_SID for each test
      jest.doMock("@/config", () => ({
        ...jest.requireActual("@/config"),
        TWILIO_ACCOUNT_SID: "test_account_sid",
      }))
    })

    it("returns true for default login code", async () => {
      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: defaultCode,
      })

      expect(result).toBe(true)
    })

    it("validates test account with valid code", async () => {
      const mockTestAccounts = [{ phone: testPhone, code: testCode }]
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(true),
        isPhoneTestAndCodeValid: jest.fn().mockReturnValue(true),
      }

      mockGetTestAccounts.mockReturnValue(mockTestAccounts)
      mockTestAccountsChecker.mockReturnValue(mockChecker)

      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBe(true)
      expect(mockChecker.isPhoneTest).toHaveBeenCalledWith(testPhone)
      expect(mockChecker.isPhoneTestAndCodeValid).toHaveBeenCalledWith({
        phone: testPhone,
        code: testCode,
      })
    })

    it("returns error for test account with invalid code", async () => {
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(true),
        isPhoneTestAndCodeValid: jest.fn().mockReturnValue(false),
      }

      mockGetTestAccounts.mockReturnValue([
        { phone: testPhone, code: "324567" as PhoneCode },
      ])
      mockTestAccountsChecker.mockReturnValue(mockChecker)

      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBeInstanceOf(PhoneCodeInvalidError)
    })

    it("returns NotImplementedError for test Twilio account", async () => {
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(false),
        isPhoneTestAndCodeValid: jest.fn(),
      }

      // Mock TWILIO_ACCOUNT_SID to be test account
      jest.resetModules()
      jest.doMock("@/config", () => ({
        ...jest.requireActual("@/config"),
        TWILIO_ACCOUNT_SID: "AC_twilio_id",
        getTestAccounts: jest.fn().mockReturnValue([]),
      }))

      jest.doMock("@/domain/accounts/test-accounts-checker", () => ({
        TestAccountsChecker: jest.fn().mockReturnValue(mockChecker),
      }))

      // Re-import the function and error class after mocking
      const { isPhoneCodeValid: mockedIsPhoneCodeValid } = await import(
        "@/services/phone-provider"
      )
      const { NotImplementedError: MockedNotImplementedError } = await import(
        "@/domain/errors"
      )

      const result = await mockedIsPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBeInstanceOf(MockedNotImplementedError)
    })

    it("uses verify service for real validation", async () => {
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(false),
        isPhoneTestAndCodeValid: jest.fn(),
      }
      const mockVerifyService: IPhoneProviderService = {
        sendTemplatedSMS: jest.fn(),
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn().mockResolvedValue(true),
      }

      mockGetTestAccounts.mockReturnValue([])
      mockTestAccountsChecker.mockReturnValue(mockChecker)
      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(mockVerifyService)

      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBe(true)
      expect(mockVerifyService.validateVerify).toHaveBeenCalledWith({
        to: testPhone,
        code: testCode,
      })
    })

    it("returns error when verify service returns error", async () => {
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(false),
        isPhoneTestAndCodeValid: jest.fn(),
      }
      const phoneCodeError = new PhoneCodeInvalidError()
      const mockVerifyService: IPhoneProviderService = {
        sendTemplatedSMS: jest.fn(),
        getCarrier: jest.fn(),
        validateDestination: jest.fn(),
        initiateVerify: jest.fn(),
        validateVerify: jest.fn().mockResolvedValue(phoneCodeError),
      }

      mockGetTestAccounts.mockReturnValue([])
      mockTestAccountsChecker.mockReturnValue(mockChecker)
      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "twilio",
        transactional: "twilio",
      })
      mockTwilioClient.mockReturnValue(mockVerifyService)

      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBe(phoneCodeError)
    })

    it("returns error when verify service config fails", async () => {
      const mockChecker = {
        isPhoneTest: jest.fn().mockReturnValue(false),
        isPhoneTestAndCodeValid: jest.fn(),
      }
      const configError = new PhoneProviderConfigError("Provider configuration failed")

      mockGetTestAccounts.mockReturnValue([])
      mockTestAccountsChecker.mockReturnValue(mockChecker)
      mockGetPhoneProviderConfig.mockReturnValue({
        verify: "prelude",
        transactional: "twilio",
      })
      mockPreludeClient.mockReturnValue(configError)

      const result = await isPhoneCodeValid({
        phone: testPhone,
        code: testCode,
      })

      expect(result).toBe(configError)
    })
  })
})
