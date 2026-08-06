jest.mock("@/config", () => ({
  getRegionRestrictionsConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

jest.mock("@/services/ipfetcher", () => ({
  IpFetcher: jest.fn(),
}))

import {
  getCustodialRestrictions,
  getSessionRegionVerdict,
} from "@/app/accounts/get-custodial-restrictions"

import { getRegionRestrictionsConfig } from "@/config"
import { AccountLevel } from "@/domain/accounts"
import { UnknownRepositoryError } from "@/domain/errors"
import { UnknownIpFetcherServiceError } from "@/domain/ipfetcher"
import { IpFetcher } from "@/services/ipfetcher"
import { UsersRepository } from "@/services/mongoose"

const mockGetConfig = getRegionRestrictionsConfig as jest.MockedFunction<
  typeof getRegionRestrictionsConfig
>
const mockUsersRepository = UsersRepository as jest.MockedFunction<typeof UsersRepository>
const mockIpFetcher = IpFetcher as jest.MockedFunction<typeof IpFetcher>

const mockFindById = jest.fn()
const mockFetchIPInfo = jest.fn()

const config = (
  overrides: Partial<RegionRestrictionsConfig> = {},
): RegionRestrictionsConfig =>
  ({
    sanctionsCountries: ["IR"],
    registrationDenyCountries: ["IR", "PK"],
    custodialDollarBalanceBlockedCountries: ["NG"],
    custodialTransferBlockedCountries: ["TR"],
    ...overrides,
  }) as RegionRestrictionsConfig

const makeAccount = (level: AccountLevel = AccountLevel.One): Account =>
  ({
    id: "00000000-0000-0000-0000-000000000001" as AccountId,
    level,
    kratosUserId: "user-id" as UserId,
  }) as Account

const NIGERIAN_PHONE = "+2348031234567"
const SALVADORAN_PHONE = "+50361234567"

const IP = "203.0.113.7" as IpAddress

describe("getCustodialRestrictions", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetConfig.mockReturnValue(config())
    mockUsersRepository.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockIpFetcher.mockReturnValue({
      fetchIPInfoWithinRegionCheckBudget: mockFetchIPInfo,
    } as unknown as ReturnType<typeof IpFetcher>)
    mockFindById.mockResolvedValue({ phone: SALVADORAN_PHONE })
    mockFetchIPInfo.mockResolvedValue({ isoCode: "SV" })
  })

  it("short-circuits with no repository read when both lists are empty", async () => {
    mockGetConfig.mockReturnValue(
      config({
        custodialDollarBalanceBlockedCountries: [],
        custodialTransferBlockedCountries: [],
      }),
    )

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it("restricts an L1 account on its live phone country", async () => {
    mockFindById.mockResolvedValue({ phone: NIGERIAN_PHONE })

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
  })

  it("falls back to phoneMetadata when the phone was removed", async () => {
    mockFindById.mockResolvedValue({ phoneMetadata: { countryCode: "NG" } })

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: true,
      transfer: false,
    })
  })

  it("prefers the live phone over stored metadata", async () => {
    mockFindById.mockResolvedValue({
      phone: SALVADORAN_PHONE,
      phoneMetadata: { countryCode: "NG" },
    })

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("treats an empty phoneMetadata country as unknown and fails open", async () => {
    mockFindById.mockResolvedValue({ phoneMetadata: { countryCode: "" } })

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("treats an unparsable phone as unknown and fails open", async () => {
    mockFindById.mockResolvedValue({ phone: "not-a-phone" })

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("fails open when the users repository errors", async () => {
    mockFindById.mockResolvedValue(new UnknownRepositoryError("users down"))

    expect(await getCustodialRestrictions({ account: makeAccount() })).toEqual({
      dollarBalance: false,
      transfer: false,
    })
  })

  it("never resolves the request IP for an L1 account", async () => {
    mockFindById.mockResolvedValue({ phone: SALVADORAN_PHONE })

    await getCustodialRestrictions({ account: makeAccount(), ip: IP })
    expect(mockFetchIPInfo).not.toHaveBeenCalled()
  })

  it("derives an L0 verdict from the request IP", async () => {
    mockFetchIPInfo.mockResolvedValue({ isoCode: "TR" })

    expect(
      await getCustodialRestrictions({
        account: makeAccount(AccountLevel.Zero),
        ip: IP,
      }),
    ).toEqual({ dollarBalance: false, transfer: true })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  // the only remaining told-vs-enforced gap: third-party-initiated recipient checks pass no
  // ip because that address is the payer's, so an L0 recipient stays unrestricted
  it("fails open for an L0 account with no request IP (third-party recipient path)", async () => {
    expect(
      await getCustodialRestrictions({ account: makeAccount(AccountLevel.Zero) }),
    ).toEqual({ dollarBalance: false, transfer: false })
    expect(mockFetchIPInfo).not.toHaveBeenCalled()
  })

  it("fails open when the IP resolver errors", async () => {
    mockFetchIPInfo.mockResolvedValue(new UnknownIpFetcherServiceError())

    expect(
      await getCustodialRestrictions({
        account: makeAccount(AccountLevel.Zero),
        ip: IP,
      }),
    ).toEqual({ dollarBalance: false, transfer: false })
  })
})

describe("getSessionRegionVerdict", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockGetConfig.mockReturnValue(config())
    mockIpFetcher.mockReturnValue({
      fetchIPInfoWithinRegionCheckBudget: mockFetchIPInfo,
    } as unknown as ReturnType<typeof IpFetcher>)
  })

  it("reports a sanctioned country and blocks creation", async () => {
    mockFetchIPInfo.mockResolvedValue({ isoCode: "IR" })

    expect(await getSessionRegionVerdict({ ip: IP })).toEqual({
      countryCode: "IR",
      restricted: true,
      custodialCreationAllowed: false,
    })
  })

  it("blocks creation without sanctioning a registration-only country", async () => {
    mockFetchIPInfo.mockResolvedValue({ isoCode: "PK" })

    expect(await getSessionRegionVerdict({ ip: IP })).toEqual({
      countryCode: "PK",
      restricted: false,
      custodialCreationAllowed: false,
    })
  })

  it("ignores proxy, risk and ASN signals", async () => {
    mockFetchIPInfo.mockResolvedValue({
      isoCode: "SV",
      proxy: true,
      risk: 100,
      asn: "AS1234",
    })

    expect(await getSessionRegionVerdict({ ip: IP })).toEqual({
      countryCode: "SV",
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("fails open on resolver failure without calling nothing else", async () => {
    mockFetchIPInfo.mockResolvedValue(new UnknownIpFetcherServiceError())

    expect(await getSessionRegionVerdict({ ip: IP })).toEqual({
      countryCode: undefined,
      restricted: false,
      custodialCreationAllowed: true,
    })
  })

  it("fails open and performs no lookup when the trusted header is absent", async () => {
    expect(await getSessionRegionVerdict({})).toEqual({
      countryCode: undefined,
      restricted: false,
      custodialCreationAllowed: true,
    })
    expect(mockFetchIPInfo).not.toHaveBeenCalled()
  })
})
