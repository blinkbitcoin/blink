jest.mock("@/config", () => ({
  getAccountsOnboardConfig: jest.fn(),
  getDefaultAccountsConfig: jest.fn(),
}))

jest.mock("@/app/authentication/ratelimits", () => ({
  checkFailedLoginAttemptPerIpLimits: jest.fn(async () => true),
  checkLoginAttemptPerLoginIdentifierLimits: jest.fn(async () => true),
  rewardFailedLoginAttemptPerIpLimits: jest.fn(async () => true),
}))

jest.mock("@/app/accounts", () => ({
  upgradeAccountFromDeviceToPhone: jest.fn(),
}))

jest.mock("@/app/accounts/create-account", () => ({
  createAccountForDeviceAccount: jest.fn(),
  createAccountWithPhoneIdentifier: jest.fn(),
}))

jest.mock("@/domain/rate-limit", () => ({
  RateLimitConfig: {},
  RateLimitPrefix: {},
}))

jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
}))

jest.mock("@/services/ipfetcher", () => ({
  IpFetcher: jest.fn(),
}))

jest.mock("@/app/authentication/get-phone-metadata", () => ({
  getPhoneMetadata: jest.fn(),
}))

jest.mock("@/domain/phone-provider", () => ({
  ChannelType: { Telegram: "telegram" },
  checkedToChannel: jest.fn(),
}))

jest.mock("@/domain/users", () => ({
  checkedToDeviceId: jest.fn(),
  checkedToIdentityPassword: jest.fn(),
  checkedToIdentityUsername: jest.fn(),
}))

jest.mock("@/app/authentication/activate-invited-account", () => ({
  activateInvitedAccount: jest.fn(async () => true),
}))

jest.mock("@/services/phone-provider", () => ({
  isPhoneCodeValid: jest.fn(async () => true),
}))

jest.mock("@/services/kratos", () => ({
  __mocks: {
    getUserIdFromIdentifier: jest.fn(),
    loginToken: jest.fn(),
  },
  IdentityRepository: () => ({
    getUserIdFromIdentifier:
      jest.requireMock("@/services/kratos").__mocks.getUserIdFromIdentifier,
  }),
  AuthWithPhonePasswordlessService: () => ({
    loginToken: jest.requireMock("@/services/kratos").__mocks.loginToken,
  }),
}))

jest.mock("@/services/mongoose", () => ({
  __mocks: { findByUserId: jest.fn() },
  AccountsRepository: () => ({
    findByUserId: jest.requireMock("@/services/mongoose").__mocks.findByUserId,
  }),
}))

jest.mock("@/app/inactivity-fee", () => ({
  recordActivity: jest.fn(),
}))

jest.mock("@/services/cache", () => ({
  RedisCacheService: () => ({}),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { loginWithPhoneToken } from "@/app/authentication/login"
import { recordActivity } from "@/app/inactivity-fee"
import { UnknownRepositoryError } from "@/domain/errors"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const kratos = jest.requireMock("@/services/kratos").__mocks as {
  getUserIdFromIdentifier: jest.Mock
  loginToken: jest.Mock
}
const { findByUserId: mockFindByUserId } = jest.requireMock("@/services/mongoose")
  .__mocks as { findByUserId: jest.Mock }
const mockRecordActivity = recordActivity as jest.MockedFunction<typeof recordActivity>

const userId = "kratos-user-id" as UserId
const accountId = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
const args = {
  phone: "+31612140876" as PhoneNumber,
  code: "000000" as PhoneCode,
  ip: "203.0.113.7" as IpAddress,
}

describe("loginWithPhoneToken activity", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    kratos.getUserIdFromIdentifier.mockResolvedValue(userId)
    mockFindByUserId.mockResolvedValue({ id: accountId })
    mockRecordActivity.mockResolvedValue({ written: true, previousActivityAt: undefined })
  })

  it("records login activity once the login is complete", async () => {
    kratos.loginToken.mockResolvedValue({ authToken: "token", kratosUserId: userId })

    const result = await loginWithPhoneToken(args)

    expect(result).toEqual({ authToken: "token", totpRequired: false, id: userId })
    expect(mockRecordActivity).toHaveBeenCalledWith({ accountId, kind: "login" })
  })

  it("does not record activity while the second factor is still pending", async () => {
    kratos.loginToken.mockResolvedValue({ authToken: "token", kratosUserId: undefined })

    const result = await loginWithPhoneToken(args)

    expect(result).toMatchObject({ totpRequired: true })
    expect(mockRecordActivity).not.toHaveBeenCalled()
  })

  it("never fails the login when recording activity fails", async () => {
    kratos.loginToken.mockResolvedValue({ authToken: "token", kratosUserId: userId })
    mockRecordActivity.mockResolvedValue(new UnknownRepositoryError("mongo down"))

    const result = await loginWithPhoneToken(args)

    expect(result).toEqual({ authToken: "token", totpRequired: false, id: userId })
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
  })

  it("never fails the login when the account cannot be resolved", async () => {
    kratos.loginToken.mockResolvedValue({ authToken: "token", kratosUserId: userId })
    mockFindByUserId.mockResolvedValue(new UnknownRepositoryError("mongo down"))

    const result = await loginWithPhoneToken(args)

    expect(result).toMatchObject({ totpRequired: false })
    expect(mockRecordActivity).not.toHaveBeenCalled()
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
  })
})
