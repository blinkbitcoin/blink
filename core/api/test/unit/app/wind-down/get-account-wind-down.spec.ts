jest.mock("@/config", () => ({
  getWindDownConfig: jest.fn(),
  SECS_PER_5_MINS: 300,
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: jest.fn(),
}))

jest.mock("@/services/cache/local-cache", () => {
  const store = new Map<string, unknown>()
  return {
    __mockCacheStore: store,
    LocalCacheService: () => ({
      get: async ({ key }: { key: string }) =>
        store.has(key) ? store.get(key) : new Error("cache-miss"),
      set: async ({ key, value }: { key: string; value: unknown }) => {
        store.set(key, value)
        return value
      },
      clear: async ({ key }: { key: string }) => {
        store.delete(key)
        return true
      },
    }),
  }
})

import { getAccountWindDown } from "@/app/wind-down/get-account-wind-down"
import { isAccountInWindDownCohort } from "@/app/wind-down/is-account-in-wind-down-cohort"

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

const { __mockCacheStore: cacheStore } = jest.requireMock(
  "@/services/cache/local-cache",
) as { __mockCacheStore: Map<string, unknown> }

const mockFindById = jest.fn()
const mockFindEarliestByAccountId = jest.fn()

const region = (overrides: Partial<WindDownRegionConfig> = {}): WindDownRegionConfig => ({
  code: "default",
  timezone: "Europe/Paris",
  receiveDisabledAt: "2026-08-01T00:00:00+02:00",
  finalDeadline: "2026-08-31T23:59:59+02:00",
  gateArmsAt: "2026-09-01T00:00:00+02:00",
  receiveDisabled: { enabled: false },
  gateClosed: { enabled: false },
  ...overrides,
})

const euRegion: WindDownRegionConfig = {
  code: "eu",
  timezone: "Europe/Berlin",
  countries: ["FR", "DE"],
  receiveDisabledAt: "2026-08-15T00:00:00+02:00",
  finalDeadline: "2026-09-15T23:59:59+02:00",
  gateArmsAt: "2026-09-16T00:00:00+02:00",
  receiveDisabled: { enabled: false },
  gateClosed: { enabled: false },
}

const windDownConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig =>
  ({
    enabled: true,
    affectedCountries: ["FR", "DE", "IS"],
    regions: [region()],
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

const PHONE_BY_COUNTRY: Record<string, string> = {
  FR: "+33612345678",
  US: "+14155552671",
  DE: "+4915112345678",
  IS: "+3546112345",
}

const withPhoneCountry = (phoneCountry: string) =>
  mockFindById.mockResolvedValue({
    phone: PHONE_BY_COUNTRY[phoneCountry],
    deletedPhones: [],
  })

describe("getAccountWindDown", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    cacheStore.clear()
    mockGetWindDownConfig.mockReturnValue(windDownConfig())
    mockUsersRepository.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockAccountsIpsRepository.mockReturnValue({
      findEarliestByAccountId: mockFindEarliestByAccountId,
    } as unknown as ReturnType<typeof AccountsIpsRepository>)
    withPhoneCountry("FR")
    mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
  })

  it("returns null and runs no cohort computation when windDown.enabled is false", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ enabled: false }))
    const result = await getAccountWindDown({ account: makeAccount() })
    expect(result).toBeNull()
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("keeps membership independent of the status switch: cohort true while the query is null", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ enabled: false }))
    const account = makeAccount()

    expect(await isAccountInWindDownCohort({ account })).toBe(true)
    expect(await getAccountWindDown({ account })).toBeNull()
  })

  it("returns null when no signal matches", async () => {
    withPhoneCountry("US")
    const result = await getAccountWindDown({ account: makeAccount() })
    expect(result).toBeNull()
  })

  it("returns PRE_CUTOFF with the region dates as Date objects when both flags are off", async () => {
    const result = await getAccountWindDown({ account: makeAccount() })
    expect(result).toEqual({
      status: "PRE_CUTOFF",
      receiveDisabledAt: new Date("2026-08-01T00:00:00+02:00"),
      finalDeadline: new Date("2026-08-31T23:59:59+02:00"),
      gateArmsAt: new Date("2026-09-01T00:00:00+02:00"),
      timezone: "Europe/Paris",
    })
    const windDown = result as AccountWindDown
    expect(windDown.receiveDisabledAt).toBeInstanceOf(Date)
    expect(windDown.finalDeadline).toBeInstanceOf(Date)
    expect(windDown.gateArmsAt).toBeInstanceOf(Date)
  })

  it("returns RECEIVE_DISABLED after the region receiveDisabled flag flips, re-deriving from cached membership", async () => {
    const account = makeAccount()

    const before = await getAccountWindDown({ account })
    expect((before as AccountWindDown).status).toBe("PRE_CUTOFF")

    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [
          region({
            receiveDisabled: {
              enabled: true,
            },
          }),
        ],
      }),
    )

    const after = await getAccountWindDown({ account })
    expect((after as AccountWindDown).status).toBe("RECEIVE_DISABLED")
    expect(mockFindById).toHaveBeenCalledTimes(1)
  })

  it("returns GATED_CLOSED when the gate flag is set regardless of receiveDisabled", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [
          region({
            gateClosed: { enabled: true },
            receiveDisabled: {
              enabled: true,
            },
          }),
        ],
      }),
    )
    const result = await getAccountWindDown({ account: makeAccount() })
    expect((result as AccountWindDown).status).toBe("GATED_CLOSED")
  })

  it("stays PRE_CUTOFF when the clock is past receiveDisabledAt but the flag is off", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        regions: [region({ receiveDisabledAt: "2020-01-01T00:00:00+02:00" })],
      }),
    )
    const result = await getAccountWindDown({ account: makeAccount() })
    expect((result as AccountWindDown).status).toBe("PRE_CUTOFF")
  })

  it("returns the matching region's dates and timezone, not the default region's", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ regions: [euRegion, region()] }),
    )
    withPhoneCountry("DE")

    const result = (await getAccountWindDown({
      account: makeAccount(),
    })) as AccountWindDown
    expect(result.timezone).toBe("Europe/Berlin")
    expect(result.finalDeadline).toEqual(new Date("2026-09-15T23:59:59+02:00"))
  })

  it("falls back to the default region when the matched country is not in any region list", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ regions: [euRegion, region()] }),
    )
    withPhoneCountry("IS")

    const result = (await getAccountWindDown({
      account: makeAccount(),
    })) as AccountWindDown
    expect(result.timezone).toBe("Europe/Paris")
    expect(result.finalDeadline).toEqual(new Date("2026-08-31T23:59:59+02:00"))
  })

  it("propagates a repository error rather than returning null", async () => {
    const error = new UnknownRepositoryError("users down")
    mockFindById.mockResolvedValue(error)
    const result = await getAccountWindDown({ account: makeAccount() })
    expect(result).toBe(error)
  })
})
