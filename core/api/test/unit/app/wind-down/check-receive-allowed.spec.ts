jest.mock("@/config", () => ({
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: jest.fn(),
}))

import { checkReceiveAllowed } from "@/app/wind-down/check-receive-allowed"

import { getWindDownConfig } from "@/config"
import { ReceiveDisabledError } from "@/domain/wind-down"
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

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
  finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
  gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
  receiveDisabled: false,
  gateClosed: false,
  ...overrides,
})

const windDownConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig =>
  ({
    enabled: true,
    affectedCountries: ["MX", "AR"],
    strictCountries: [],
    excludedAccountIds: [],
    receiveBlockedAccountIds: [],
    includeLevelZero: false,
    regions: [region()],
    ...overrides,
  }) as WindDownConfig

const makeAccount = (overrides: Partial<Account> = {}): Account =>
  ({
    id: crypto.randomUUID() as AccountId,
    createdAt: new Date(),
    defaultWalletId: crypto.randomUUID() as WalletId,
    level: 1 as AccountLevel,
    status: "active" as AccountStatus,
    statusHistory: [],
    contactEnabled: true,
    kratosUserId: "user-id" as UserId,
    displayCurrency: "USD" as DisplayCurrency,
    ...overrides,
  }) as Account

const MX_PHONE = "+525512345678"
const GT_PHONE = "+50251234567"

describe("checkReceiveAllowed", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockUsersRepository.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockAccountsIpsRepository.mockReturnValue({
      findEarliestByAccountId: mockFindEarliestByAccountId,
    } as unknown as ReturnType<typeof AccountsIpsRepository>)
    mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
  })

  it("allows and reads nothing when no region is armed", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig())
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBe(true)
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("refuses a cohort account when receiveDisabled is armed", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ regions: [region({ receiveDisabled: true })] }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("refuses when only gateClosed is armed", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [region({ receiveDisabled: false, gateClosed: true })],
      }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("refuses while the display switch is off", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ enabled: false, regions: [region({ receiveDisabled: true })] }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("allows a non-cohort account while a region is armed", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ regions: [region({ receiveDisabled: true })] }),
    )
    mockFindById.mockResolvedValue({ phone: GT_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBe(true)
  })

  it("allows an excluded account, inheriting the cohort exclusion list", async () => {
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        excludedAccountIds: [account.id],
        regions: [region({ receiveDisabled: true })],
      }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account })

    expect(result).toBe(true)
  })

  it("refuses a receive-blocked account even while every region flag is dark", async () => {
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ receiveBlockedAccountIds: [account.id] }),
    )

    const result = await checkReceiveAllowed({ account })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
    // block list is independent of the cohort: no membership evaluation, no reads
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("allows an account that is not on the block list while dark", async () => {
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ receiveBlockedAccountIds: [crypto.randomUUID()] }),
    )

    const result = await checkReceiveAllowed({ account })

    expect(result).toBe(true)
  })

  it("returns the repository error rather than allowing", async () => {
    const repoError = new UnknownRepositoryError("boom")
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ regions: [region({ receiveDisabled: true })] }),
    )
    mockFindById.mockResolvedValue(repoError)

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBe(repoError)
    expect(result).not.toBeInstanceOf(ReceiveDisabledError)
  })

  it("routes to the region matching the cohort country", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [
          region({ code: "mx", countries: ["MX"], receiveDisabled: true }),
          region({ code: "default", receiveDisabled: false }),
        ],
      }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBeInstanceOf(ReceiveDisabledError)
  })

  it("allows when the matched country resolves to no region", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [region({ code: "ar", countries: ["AR"], receiveDisabled: true })],
      }),
    )
    mockFindById.mockResolvedValue({ phone: MX_PHONE, deletedPhones: [] })

    const result = await checkReceiveAllowed({ account: makeAccount() })

    expect(result).toBe(true)
  })
})
