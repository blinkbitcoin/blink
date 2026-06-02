jest.mock("@/config", () => ({
  __mockPhoneMetadataValidationSettings: { enabled: true },
  getAccountsOnboardConfig: jest.fn(() => ({
    phoneMetadataValidationSettings:
      jest.requireMock("@/config").__mockPhoneMetadataValidationSettings,
  })),
  SECS_PER_10_MINS: 600,
}))

jest.mock("@/domain/rate-limit", () => ({
  RateLimitConfig: {
    requestTelegramPassportNonceAttemptPerPhoneNumber:
      "requestTelegramPassportNonceAttemptPerPhoneNumber",
    requestTelegramPassportNonceAttemptPerIp: "requestTelegramPassportNonceAttemptPerIp",
  },
}))

jest.mock("@/domain/users", () => ({
  checkedToPhoneNumber: jest.fn(),
}))

jest.mock("@/domain/phone-provider", () => ({
  checkedToChannel: jest.fn(),
  ChannelType: {
    Telegram: "telegram",
  },
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
}))

jest.mock("@/services/phone-provider", () => ({
  getPhoneProviderVerifyService: jest.fn(),
}))

jest.mock("@/services/cache", () => ({
  __mockRedisSet: jest.fn(),
  RedisCacheService: () => ({
    set: jest.requireMock("@/services/cache").__mockRedisSet,
  }),
}))

import { requestTelegramPassportNonce } from "@/app/authentication/request-telegram-passport-nonce"
import { ChannelType } from "@/domain/phone-provider"
import {
  InvalidPhoneNumberPhoneProviderError,
  PhoneProviderConfigError,
} from "@/domain/phone-provider/errors"
import {
  InvalidChannelForCountry,
  InvalidPhoneNumber,
  PersistError,
} from "@/domain/errors"
import {
  TelegramPassportNonceAttemptIpRateLimiterExceededError,
  TelegramPassportNonceAttemptPhoneRateLimiterExceededError,
} from "@/domain/rate-limit/errors"

const { __mockPhoneMetadataValidationSettings: mockPhoneMetadataValidationSettings } =
  jest.requireMock("@/config") as {
    __mockPhoneMetadataValidationSettings: { enabled: boolean }
  }

const { checkedToPhoneNumber: mockCheckedToPhoneNumber } = jest.requireMock(
  "@/domain/users",
) as {
  checkedToPhoneNumber: jest.Mock
}

const { checkedToChannel: mockCheckedToChannel } = jest.requireMock(
  "@/domain/phone-provider",
) as {
  checkedToChannel: jest.Mock
}

const { consumeLimiter: mockConsumeLimiter } = jest.requireMock(
  "@/services/rate-limit",
) as {
  consumeLimiter: jest.Mock
}

const { getPhoneProviderVerifyService: mockGetPhoneProviderVerifyService } =
  jest.requireMock("@/services/phone-provider") as {
    getPhoneProviderVerifyService: jest.Mock
  }

const { __mockRedisSet: mockRedisSet } = jest.requireMock("@/services/cache") as {
  __mockRedisSet: jest.Mock
}

const mockValidateDestination = jest.fn()

describe("requestTelegramPassportNonce", () => {
  const phone = "+16505550123"
  const ip = "127.0.0.1" as IpAddress

  beforeEach(() => {
    jest.clearAllMocks()

    mockPhoneMetadataValidationSettings.enabled = true
    mockCheckedToPhoneNumber.mockReturnValue(phone as PhoneNumber)
    mockCheckedToChannel.mockReturnValue(ChannelType.Telegram)
    mockConsumeLimiter.mockResolvedValue(true)
    mockValidateDestination.mockResolvedValue(true)
    mockGetPhoneProviderVerifyService.mockReturnValue({
      validateDestination: mockValidateDestination,
    })
    mockRedisSet.mockResolvedValue(true)
  })

  it("returns validation error when checkedToPhoneNumber fails", async () => {
    const error = new InvalidPhoneNumber(phone)
    mockCheckedToPhoneNumber.mockReturnValue(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockCheckedToChannel).not.toHaveBeenCalled()
    expect(mockGetPhoneProviderVerifyService).not.toHaveBeenCalled()
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("returns validation error when checkedToChannel fails", async () => {
    const error = new InvalidChannelForCountry("telegram")
    mockCheckedToChannel.mockReturnValue(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockCheckedToChannel).toHaveBeenCalledWith(phone, ChannelType.Telegram)
    expect(mockGetPhoneProviderVerifyService).not.toHaveBeenCalled()
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("returns provider config error when verify service factory fails", async () => {
    const error = new PhoneProviderConfigError("Provider configuration failed")
    mockGetPhoneProviderVerifyService.mockReturnValue(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockValidateDestination).not.toHaveBeenCalled()
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("returns invalid phone number error from phone provider validation", async () => {
    const error = new InvalidPhoneNumberPhoneProviderError(
      "The provided phone number does not belong to a valid, assigned number range.",
    )
    mockValidateDestination.mockResolvedValue(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockValidateDestination).toHaveBeenCalledWith(phone)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("skips provider validation when metadata validation is disabled", async () => {
    mockPhoneMetadataValidationSettings.enabled = false

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).not.toBeInstanceOf(Error)
    expect(mockGetPhoneProviderVerifyService).not.toHaveBeenCalled()
    expect(mockValidateDestination).not.toHaveBeenCalled()
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(2)
  })

  it("returns ip rate limit error and does not check phone limiter", async () => {
    const error = new TelegramPassportNonceAttemptIpRateLimiterExceededError()
    mockConsumeLimiter.mockResolvedValueOnce(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("returns phone rate limit error after ip limiter passes", async () => {
    const error = new TelegramPassportNonceAttemptPhoneRateLimiterExceededError()
    mockConsumeLimiter.mockResolvedValueOnce(true).mockResolvedValueOnce(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(2)
    expect(mockRedisSet).not.toHaveBeenCalled()
  })

  it("returns cache error when redis set fails", async () => {
    const error = new PersistError("failed to persist telegram passport nonce request")
    mockRedisSet.mockResolvedValue(error)

    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toBe(error)
    expect(mockRedisSet).toHaveBeenCalledTimes(1)
  })

  it("returns nonce and stores request details on success", async () => {
    const result = await requestTelegramPassportNonce({ phone, ip })

    expect(result).toEqual(expect.any(String))
    expect(mockGetPhoneProviderVerifyService).toHaveBeenCalledTimes(1)
    expect(mockValidateDestination).toHaveBeenCalledWith(phone)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(2)
    expect(mockRedisSet).toHaveBeenCalledWith({
      key: expect.any(String),
      value: phone,
      ttlSecs: 600,
    })
  })
})
