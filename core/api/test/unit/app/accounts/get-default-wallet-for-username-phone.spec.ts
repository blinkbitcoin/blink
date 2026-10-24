jest.mock("@/services/rate-limit", () => ({
  consumeLimiter: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addEventToCurrentSpan: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  UsersRepository: jest.fn(),
}))

jest.mock("@/app/accounts/create-account", () => ({
  createInvitedAccountFromPhone: jest.fn(),
}))

jest.mock("@/app/accounts/get-wallet-from-account", () => ({
  getWalletFromAccount: jest.fn(),
}))

import { getDefaultWalletByUsernameOrPhone } from "@/app/accounts/get-default-wallet-for-username-phone"
import { createInvitedAccountFromPhone } from "@/app/accounts/create-account"
import { getWalletFromAccount } from "@/app/accounts/get-wallet-from-account"
import {
  CouldNotFindUserFromPhoneError,
  CouldNotFindWalletFromUsernameAndCurrencyError,
} from "@/domain/errors"
import { ANON_PHONE_LOOKUP_GLOBAL_KEY, RateLimitConfig } from "@/domain/rate-limit"
import { AnonPhoneLookupGlobalRateLimiterExceededError } from "@/domain/rate-limit/errors"
import { WalletCurrency } from "@/domain/shared"
import { mapError } from "@/graphql/error-map"
import { AccountsRepository, UsersRepository } from "@/services/mongoose"
import { consumeLimiter } from "@/services/rate-limit"
import { addEventToCurrentSpan } from "@/services/tracing"

const mockConsumeLimiter = consumeLimiter as jest.Mock
const mockAccountsRepository = AccountsRepository as jest.Mock
const mockUsersRepository = UsersRepository as jest.Mock
const mockCreateInvitedAccountFromPhone = createInvitedAccountFromPhone as jest.Mock
const mockGetWalletFromAccount = getWalletFromAccount as jest.Mock
const mockAddEventToCurrentSpan = addEventToCurrentSpan as jest.Mock

const mockFindByUsername = jest.fn()
const mockFindByUserId = jest.fn()
const mockFindByPhone = jest.fn()

const registeredPhone = "+50376543210" as PhoneNumber
const unknownPhone = "+50376543211" as PhoneNumber
const username = "alice" as Username

const account = { id: "account-id" } as Account
const user = { id: "user-id" } as User
const wallet = { id: "wallet-id" } as Wallet

beforeEach(() => {
  jest.clearAllMocks()

  mockAccountsRepository.mockReturnValue({
    findByUsername: mockFindByUsername,
    findByUserId: mockFindByUserId,
  })
  mockUsersRepository.mockReturnValue({ findByPhone: mockFindByPhone })

  mockFindByUsername.mockResolvedValue(account)
  mockFindByUserId.mockResolvedValue(account)
  mockFindByPhone.mockImplementation(async (phone: PhoneNumber) =>
    phone === registeredPhone ? user : new CouldNotFindUserFromPhoneError(phone),
  )
  mockCreateInvitedAccountFromPhone.mockResolvedValue(account)
  mockGetWalletFromAccount.mockResolvedValue(wallet)
  mockConsumeLimiter.mockResolvedValue(true)
})

const blockGlobalKey = () =>
  mockConsumeLimiter.mockImplementation(
    async () => new AnonPhoneLookupGlobalRateLimiterExceededError(),
  )

describe("getDefaultWalletByUsernameOrPhone", () => {
  it("resolves an anonymous username lookup without consuming the limiter", async () => {
    const result = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: username,
      walletCurrency: WalletCurrency.Usd,
      isAuthenticated: false,
    })

    expect(result).toBe(wallet)
    expect(mockFindByUsername).toHaveBeenCalledWith(username)
    expect(mockGetWalletFromAccount).toHaveBeenCalledWith(account, WalletCurrency.Usd)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
  })

  it("resolves an anonymous username lookup while the global key is blocked", async () => {
    blockGlobalKey()

    const result = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: username,
      isAuthenticated: false,
    })

    expect(result).toBe(wallet)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
  })

  it("consumes one global point for an anonymous phone lookup under the limit", async () => {
    const result = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: unknownPhone,
      isAuthenticated: false,
    })

    expect(result).toBe(wallet)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockConsumeLimiter).toHaveBeenCalledWith({
      rateLimitConfig: RateLimitConfig.anonPhoneLookupGlobal,
      keyToConsume: ANON_PHONE_LOOKUP_GLOBAL_KEY,
    })
    expect(mockFindByPhone).toHaveBeenCalledWith(unknownPhone)
    expect(mockCreateInvitedAccountFromPhone).toHaveBeenCalledWith({
      phone: unknownPhone,
    })
    expect(mockAddEventToCurrentSpan).not.toHaveBeenCalled()
  })

  it("resolves an anonymous registered phone lookup under the limit", async () => {
    const result = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: registeredPhone,
      walletCurrency: WalletCurrency.Usd,
      isAuthenticated: false,
    })

    expect(result).toBe(wallet)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(1)
    expect(mockFindByUserId).toHaveBeenCalledWith(user.id)
    expect(mockCreateInvitedAccountFromPhone).not.toHaveBeenCalled()
    expect(mockGetWalletFromAccount).toHaveBeenCalledWith(account, WalletCurrency.Usd)
    expect(mockAddEventToCurrentSpan).not.toHaveBeenCalled()
  })

  it("returns the same error for registered and unknown phones when blocked", async () => {
    blockGlobalKey()

    const registered = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: registeredPhone,
      isAuthenticated: false,
    })
    const unknown = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: unknownPhone,
      isAuthenticated: false,
    })

    expect(registered).toBeInstanceOf(AnonPhoneLookupGlobalRateLimiterExceededError)
    expect(unknown).toBeInstanceOf(AnonPhoneLookupGlobalRateLimiterExceededError)
    expect(registered).not.toBe(unknown)
    const mappedRegistered = mapError(registered as ApplicationError)
    const mappedUnknown = mapError(unknown as ApplicationError)
    expect(mappedRegistered.extensions.code).toBe("TOO_MANY_REQUEST")
    expect(mappedRegistered.extensions.code).toBe(mappedUnknown.extensions.code)
    expect(mappedRegistered.message).toBe(mappedUnknown.message)
    expect(mockConsumeLimiter).toHaveBeenCalledTimes(2)
    expect(mockAddEventToCurrentSpan).toHaveBeenCalledTimes(2)
    expect(mockAddEventToCurrentSpan).toHaveBeenCalledWith("anonPhoneLookupCapExceeded", {
      "phoneLookup.cap.scope": "global",
    })
    expect(mockFindByPhone).not.toHaveBeenCalled()
    expect(mockFindByUserId).not.toHaveBeenCalled()
    expect(mockCreateInvitedAccountFromPhone).not.toHaveBeenCalled()
    expect(mockGetWalletFromAccount).not.toHaveBeenCalled()
  })

  it("resolves an authenticated phone lookup without consuming the limiter", async () => {
    blockGlobalKey()

    const registered = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: registeredPhone,
      isAuthenticated: true,
    })
    const unknown = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: unknownPhone,
      isAuthenticated: true,
    })

    expect(registered).toBe(wallet)
    expect(unknown).toBe(wallet)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockFindByUserId).toHaveBeenCalledWith(user.id)
    expect(mockCreateInvitedAccountFromPhone).toHaveBeenCalledWith({
      phone: unknownPhone,
    })
  })

  it("rejects an anonymous invalid string without consuming the limiter", async () => {
    const result = await getDefaultWalletByUsernameOrPhone({
      usernameOrPhone: "!!" as Username,
      isAuthenticated: false,
    })

    expect(result).toBeInstanceOf(CouldNotFindWalletFromUsernameAndCurrencyError)
    expect(mockConsumeLimiter).not.toHaveBeenCalled()
    expect(mockFindByPhone).not.toHaveBeenCalled()
  })
})
