jest.mock("@/config", () => ({
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: jest.fn(),
}))

import {
  isAccountInWindDownCohort,
  evaluateWindDownCohortMatch,
} from "@/app/wind-down/is-account-in-wind-down-cohort"

import { getWindDownConfig } from "@/config"
import { CouldNotFindAccountIpError, UnknownRepositoryError } from "@/domain/errors"
import { UsersRepository } from "@/services/mongoose"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"

const mockGetWindDownConfig = getWindDownConfig as jest.MockedFunction<
  typeof getWindDownConfig
>
const mockUsersRepository = UsersRepository as jest.MockedFunction<typeof UsersRepository>
const mockAccountsIpsRepository = AccountsIpsRepository as jest.MockedFunction<
  typeof AccountsIpsRepository
>

const mockFindById = jest.fn()
const mockFindEarliestByAccountId = jest.fn()

const windDownConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig =>
  ({
    enabled: true,
    affectedCountries: ["FR", "DE", "IS"],
    regions: [],
    ...overrides,
  }) as WindDownConfig

const makeAccount = (overrides: Partial<Account> = {}): Account =>
  ({
    id: crypto.randomUUID() as AccountId,
    createdAt: new Date(),
    defaultWalletId: crypto.randomUUID() as WalletId,
    withdrawFee: undefined,
    level: 1 as AccountLevel,
    status: "active" as AccountStatus,
    statusHistory: [],
    contactEnabled: true,
    kratosUserId: "user-id" as UserId,
    displayCurrency: "USD" as DisplayCurrency,
    ...overrides,
  }) as Account

const US_PHONE = "+14155552671"
const FR_PHONE = "+33612345678"

const withUser = (
  phone: string | undefined,
  deletedPhones: string[] = [],
  phoneMetadataCountry?: string,
) =>
  mockFindById.mockResolvedValue({
    phone,
    phoneMetadata: phoneMetadataCountry
      ? { countryCode: phoneMetadataCountry }
      : undefined,
    deletedPhones,
  })

describe("isAccountInWindDownCohort", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetWindDownConfig.mockReturnValue(windDownConfig())
    mockUsersRepository.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockAccountsIpsRepository.mockReturnValue({
      findEarliestByAccountId: mockFindEarliestByAccountId,
    } as unknown as ReturnType<typeof AccountsIpsRepository>)
    withUser(US_PHONE)
    mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
  })

  it("returns false when no signal matches the affected countries", async () => {
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("returns true when the current phone number resolves to an affected country", async () => {
    withUser(FR_PHONE)
    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })
    expect(result).toEqual({ matched: true, matchedCountry: "FR" })
  })

  it("returns true for a deleted EU phone when the current phone is non-EU", async () => {
    withUser(US_PHONE, [FR_PHONE])
    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })
    expect(result).toEqual({ matched: true, matchedCountry: "FR" })
  })

  it("ignores an EU phoneMetadata.countryCode on a non-EU number, so nobody is enforced against without being notified", async () => {
    withUser(US_PHONE, [], "FR")
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("matches an EU number even when phoneMetadata.countryCode reports a non-EU country", async () => {
    withUser(FR_PHONE, [], "US")
    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })
    expect(result).toEqual({ matched: true, matchedCountry: "FR" })
  })

  it("skips an unparseable current phone number without losing the other signals", async () => {
    withUser("not-a-phone", [FR_PHONE])
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("returns false for a phone-less account with no other signal", async () => {
    withUser(undefined)
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("skips an unparseable deleted phone and still evaluates the remaining signals", async () => {
    withUser(US_PHONE, ["not-a-phone", FR_PHONE])
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("matches on the creation-IP country when the phone country is non-EU", async () => {
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: { isoCode: "FR" } })
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("treats an accountips row with no geo metadata as an absent creation-IP signal", async () => {
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: undefined })
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("treats a missing accountips row as an absent creation-IP signal, not an error", async () => {
    withUser(FR_PHONE)
    mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("returns the users-lookup error rather than coercing it to a boolean", async () => {
    const error = new UnknownRepositoryError("users down")
    mockFindById.mockResolvedValue(error)
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(error)
  })

  it("returns the accountips error when it is not a not-found error", async () => {
    const error = new UnknownRepositoryError("accountips down")
    mockFindEarliestByAccountId.mockResolvedValue(error)
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(error)
  })

  it("does not let a transient error stick: the next call recomputes", async () => {
    const account = makeAccount()
    mockFindById
      .mockResolvedValueOnce(new UnknownRepositoryError("transient"))
      .mockResolvedValue({ phone: FR_PHONE, deletedPhones: [] })

    const first = await isAccountInWindDownCohort({ account })
    expect(first).toBeInstanceOf(UnknownRepositoryError)

    const second = await isAccountInWindDownCohort({ account })
    expect(second).toBe(true)
    expect(mockFindById).toHaveBeenCalledTimes(2)
  })

  it("recomputes from the repositories on every call — the result is not memoised", async () => {
    withUser(FR_PHONE)
    const account = makeAccount()

    expect(await isAccountInWindDownCohort({ account })).toBe(true)
    expect(await isAccountInWindDownCohort({ account })).toBe(true)

    expect(mockFindById).toHaveBeenCalledTimes(2)
    expect(mockFindEarliestByAccountId).toHaveBeenCalledTimes(2)
  })

  it("stays in-cohort regardless of the windDown.enabled status switch", async () => {
    withUser(FR_PHONE)
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ enabled: false }))
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("short-circuits without reading repositories when affectedCountries is empty", async () => {
    withUser(FR_PHONE)
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ affectedCountries: [] }))

    expect(await isAccountInWindDownCohort({ account: makeAccount() })).toBe(false)

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })
})
