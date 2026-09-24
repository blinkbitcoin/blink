jest.mock("@/config", () => ({
  getWindDownConfig: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
  WindDownCohortAssessmentsRepository: jest.fn(),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: jest.fn(),
}))

import {
  isAccountInWindDownCohort,
  evaluateWindDownCohortMatch,
} from "@/app/wind-down/is-account-in-wind-down-cohort"

import { getWindDownConfig } from "@/config"
import {
  CouldNotFindAccountIpError,
  CouldNotFindWindDownCohortAssessmentError,
  UnknownRepositoryError,
} from "@/domain/errors"
import { UsersRepository, WindDownCohortAssessmentsRepository } from "@/services/mongoose"
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

const mockWindDownCohortAssessmentsRepository =
  WindDownCohortAssessmentsRepository as jest.MockedFunction<
    typeof WindDownCohortAssessmentsRepository
  >
const mockFindLastByAccountIdBefore = jest.fn()
const mockFindAssessmentByAccountId = jest.fn()
const mockPersistAssessment = jest.fn()

const setupRepositoryMocks = () => {
  mockUsersRepository.mockReturnValue({
    findById: mockFindById,
  } as unknown as ReturnType<typeof UsersRepository>)
  mockAccountsIpsRepository.mockReturnValue({
    findEarliestByAccountId: mockFindEarliestByAccountId,
    findLastByAccountIdBefore: mockFindLastByAccountIdBefore,
  } as unknown as ReturnType<typeof AccountsIpsRepository>)
  mockWindDownCohortAssessmentsRepository.mockReturnValue({
    findByAccountId: mockFindAssessmentByAccountId,
    persist: mockPersistAssessment,
  } as unknown as ReturnType<typeof WindDownCohortAssessmentsRepository>)
  mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
  mockFindLastByAccountIdBefore.mockResolvedValue(new CouldNotFindAccountIpError())
  mockFindAssessmentByAccountId.mockResolvedValue(
    new CouldNotFindWindDownCohortAssessmentError(),
  )
  mockPersistAssessment.mockImplementation(async (args) => ({
    ...args,
    createdAt: new Date(),
  }))
}

const windDownConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig =>
  ({
    enabled: true,
    affectedCountries: ["FR", "DE", "IS"],
    excludedAccountIds: [],
    receiveBlockedAccountIds: [],
    includeLevelZero: false,
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

  it("skips an unparsable current phone number without losing the other signals", async () => {
    withUser("not-a-phone", [FR_PHONE])
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(true)
  })

  it("returns false for a phone-less account with no other signal", async () => {
    withUser(undefined)
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("skips an unparsable deleted phone and still evaluates the remaining signals", async () => {
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

  it("excludes an account listed in excludedAccountIds without reading repositories", async () => {
    withUser(FR_PHONE)
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ excludedAccountIds: [account.id] }),
    )

    expect(await evaluateWindDownCohortMatch({ account })).toEqual({ matched: false })

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("still matches an account when a different id is excluded", async () => {
    withUser(FR_PHONE)
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ excludedAccountIds: [crypto.randomUUID()] }),
    )

    expect(await evaluateWindDownCohortMatch({ account: makeAccount() })).toEqual({
      matched: true,
      matchedCountry: "FR",
    })
  })

  it("returns not-matched when the account is excluded and affectedCountries is empty", async () => {
    withUser(FR_PHONE)
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({
        affectedCountries: [],
        excludedAccountIds: [account.id],
      }),
    )

    expect(await evaluateWindDownCohortMatch({ account })).toEqual({ matched: false })

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("does not include a Level 0 account when includeLevelZero is off", async () => {
    const result = await isAccountInWindDownCohort({
      account: makeAccount({ level: 0 as AccountLevel }),
    })
    expect(result).toBe(false)
  })

  it("includes a Level 0 account with no affected-country signal when includeLevelZero is on", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ includeLevelZero: true }))
    const result = await evaluateWindDownCohortMatch({
      account: makeAccount({ level: 0 as AccountLevel }),
    })
    expect(result).toEqual({ matched: true })
  })

  it("reports the country match, not the level fallback, for a Level 0 account with an affected creation-IP signal", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ includeLevelZero: true }))
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: { isoCode: "FR" } })
    const result = await evaluateWindDownCohortMatch({
      account: makeAccount({ level: 0 as AccountLevel }),
    })
    expect(result).toEqual({ matched: true, matchedCountry: "FR" })
  })

  it("does not include a non-Level-0 account without a country match when includeLevelZero is on", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ includeLevelZero: true }))
    const result = await isAccountInWindDownCohort({ account: makeAccount() })
    expect(result).toBe(false)
  })

  it("excludes a Level 0 account listed in excludedAccountIds without reading repositories", async () => {
    const account = makeAccount({ level: 0 as AccountLevel })
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ includeLevelZero: true, excludedAccountIds: [account.id] }),
    )

    expect(await evaluateWindDownCohortMatch({ account })).toEqual({ matched: false })

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("does not treat a missing level as Level 0, and still evaluates country signals", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ includeLevelZero: true }))
    const account = makeAccount({ level: undefined })

    expect(await isAccountInWindDownCohort({ account })).toBe(false)

    withUser(FR_PHONE)
    expect(await isAccountInWindDownCohort({ account })).toBe(true)
  })

  it("includes a Level 0 account without reading repositories when affectedCountries is empty", async () => {
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ includeLevelZero: true, affectedCountries: [] }),
    )

    expect(
      await evaluateWindDownCohortMatch({
        account: makeAccount({ level: 0 as AccountLevel }),
      }),
    ).toEqual({ matched: true })

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("still short-circuits a non-Level-0 account when affectedCountries is empty and includeLevelZero is on", async () => {
    withUser(FR_PHONE)
    mockGetWindDownConfig.mockReturnValue(
      windDownConfig({ includeLevelZero: true, affectedCountries: [] }),
    )

    expect(await isAccountInWindDownCohort({ account: makeAccount() })).toBe(false)

    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
  })

  it("returns the users-lookup error for a Level 0 account instead of matching through it", async () => {
    mockGetWindDownConfig.mockReturnValue(windDownConfig({ includeLevelZero: true }))
    const error = new UnknownRepositoryError("users down")
    mockFindById.mockResolvedValue(error)

    const result = await isAccountInWindDownCohort({
      account: makeAccount({ level: 0 as AccountLevel }),
    })
    expect(result).toBe(error)
  })
})

describe("evaluateWindDownCohortMatch with cohort flags on", () => {
  const CUTOFF = new Date("2026-07-01T00:00:00Z")

  // arbitrary non-deployed codes: MX/AR/PE affected, KE/FJ strict, GT neither
  const GT_PHONE = "+50251234567"
  const MX_PHONE = "+525512345678"
  const KE_PHONE = "+254712345678"

  const flagsConfig = (overrides: Partial<WindDownConfig> = {}): WindDownConfig =>
    windDownConfig({
      affectedCountries: ["MX", "AR", "PE"],
      usePersistedCohortFlag: true,
      ipEvidenceCutoff: CUTOFF,
      strictCountries: ["KE", "FJ"],
      ...overrides,
    })

  const storedAssessment = (
    overrides: Partial<WindDownCohortAssessment> = {},
  ): WindDownCohortAssessment =>
    ({
      accountId: "stored-account-id" as AccountId,
      matched: true,
      assignedCountry: "MX" as CohortCountry,
      rule: "hierarchy" as WindDownCohortRule,
      signals: { phoneCountry: "MX" },
      createdAt: new Date("2026-07-15T00:00:00Z"),
      ...overrides,
    }) as WindDownCohortAssessment

  beforeEach(() => {
    jest.resetAllMocks()
    mockGetWindDownConfig.mockReturnValue(flagsConfig())
    setupRepositoryMocks()
    withUser(GT_PHONE)
  })

  it("returns the stored verdict with no users or accountips reads", async () => {
    mockFindAssessmentByAccountId.mockResolvedValue(storedAssessment())

    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })

    expect(result).toEqual({ matched: true, matchedCountry: "MX" })
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockFindEarliestByAccountId).not.toHaveBeenCalled()
    expect(mockFindLastByAccountIdBefore).not.toHaveBeenCalled()
    expect(mockPersistAssessment).not.toHaveBeenCalled()
  })

  it("maps a stored not-matched verdict through the live level-zero overlay", async () => {
    mockFindAssessmentByAccountId.mockResolvedValue(
      storedAssessment({ matched: false, assignedCountry: undefined }),
    )
    mockGetWindDownConfig.mockReturnValue(flagsConfig({ includeLevelZero: true }))

    expect(
      await evaluateWindDownCohortMatch({
        account: makeAccount({ level: 0 as AccountLevel }),
      }),
    ).toEqual({ matched: true })

    expect(
      await evaluateWindDownCohortMatch({
        account: makeAccount({ level: 1 as AccountLevel }),
      }),
    ).toEqual({ matched: false })
  })

  it("assesses and persists exactly once on first evaluation", async () => {
    withUser(MX_PHONE)
    const account = makeAccount()

    const result = await evaluateWindDownCohortMatch({ account })

    expect(result).toEqual({ matched: true, matchedCountry: "MX" })
    expect(mockPersistAssessment).toHaveBeenCalledTimes(1)
    expect(mockPersistAssessment).toHaveBeenCalledWith({
      accountId: account.id,
      matched: true,
      assignedCountry: "MX",
      rule: "hierarchy",
      signals: {
        phoneCountry: "MX",
        newestDeletedPhoneCountry: undefined,
        creationIpCountry: undefined,
        latestIpCountry: undefined,
      },
    })
  })

  it("persists the strict-list rule when a strict phone matches", async () => {
    withUser(KE_PHONE)
    const account = makeAccount()

    const result = await evaluateWindDownCohortMatch({ account })

    expect(result).toEqual({ matched: true, matchedCountry: "KE" })
    expect(mockPersistAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        matched: true,
        assignedCountry: "KE",
        rule: "strict-list",
      }),
    )
  })

  it("persists the released country and rule on an exclusion override", async () => {
    withUser(MX_PHONE)
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: { isoCode: "GT" } })
    mockFindLastByAccountIdBefore.mockResolvedValue({ metadata: { isoCode: "GT" } })
    const account = makeAccount()

    const result = await evaluateWindDownCohortMatch({ account })

    expect(result).toEqual({ matched: false })
    expect(mockPersistAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        matched: false,
        assignedCountry: "GT",
        rule: "exclusion-override",
      }),
    )
  })

  it("consults only the newest deleted phone, never an older one", async () => {
    // stored append-only, newest last: the affected number is the older deletion
    withUser(undefined, [MX_PHONE, GT_PHONE])
    const account = makeAccount()

    const result = await evaluateWindDownCohortMatch({ account })

    expect(result).toEqual({ matched: false })
    expect(mockPersistAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        matched: false,
        assignedCountry: "GT",
        rule: "hierarchy",
        signals: expect.objectContaining({ newestDeletedPhoneCountry: "GT" }),
      }),
    )
  })

  it("does not skip past an unparsable newest deleted phone to an older affected one", async () => {
    withUser(undefined, [MX_PHONE, "not-a-phone"])
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: { isoCode: "GT" } })

    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })

    expect(result).toEqual({ matched: false })
    expect(mockPersistAssessment).toHaveBeenCalledWith(
      expect.objectContaining({
        matched: false,
        assignedCountry: "GT",
        rule: "hierarchy",
        signals: expect.objectContaining({ creationIpCountry: "GT" }),
      }),
    )
  })

  it("bounds the lazy assessment's latest-IP evidence to the configured cutoff", async () => {
    withUser(MX_PHONE)
    const account = makeAccount()

    await evaluateWindDownCohortMatch({ account })

    expect(mockFindLastByAccountIdBefore).toHaveBeenCalledWith({
      accountId: account.id,
      cutoff: CUTOFF,
    })
  })

  it("reuses the persisted verdict even when the signals change later", async () => {
    withUser(MX_PHONE)
    const account = makeAccount()

    const first = await evaluateWindDownCohortMatch({ account })
    expect(first).toEqual({ matched: true, matchedCountry: "MX" })

    mockFindAssessmentByAccountId.mockResolvedValue(storedAssessment())
    withUser(GT_PHONE)

    const second = await evaluateWindDownCohortMatch({ account })
    expect(second).toEqual({ matched: true, matchedCountry: "MX" })

    expect(mockFindById).toHaveBeenCalledTimes(1)
    expect(mockPersistAssessment).toHaveBeenCalledTimes(1)
  })

  it("keeps a released account out even when its live signals turn affected", async () => {
    mockFindAssessmentByAccountId.mockResolvedValue(
      storedAssessment({
        matched: false,
        assignedCountry: "GT" as CohortCountry,
        rule: "exclusion-override" as WindDownCohortRule,
      }),
    )
    withUser(MX_PHONE)

    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })

    expect(result).toEqual({ matched: false })
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockPersistAssessment).not.toHaveBeenCalled()
  })

  it("trusts the concurrent winner's persisted verdict over its own computation", async () => {
    withUser(MX_PHONE)
    mockPersistAssessment.mockResolvedValue(
      storedAssessment({ matched: false, assignedCountry: undefined }),
    )

    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })

    expect(result).toEqual({ matched: false })
  })

  it("short-circuits an excluded account before the assessment lookup", async () => {
    const account = makeAccount()
    mockGetWindDownConfig.mockReturnValue(
      flagsConfig({ excludedAccountIds: [account.id] }),
    )

    expect(await evaluateWindDownCohortMatch({ account })).toEqual({ matched: false })

    expect(mockFindAssessmentByAccountId).not.toHaveBeenCalled()
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockPersistAssessment).not.toHaveBeenCalled()
  })

  it("still assesses when affectedCountries is empty — no kill-switch on this path", async () => {
    withUser(MX_PHONE)
    mockGetWindDownConfig.mockReturnValue(flagsConfig({ affectedCountries: [] }))
    const account = makeAccount()

    const result = await evaluateWindDownCohortMatch({ account })

    expect(result).toEqual({ matched: false })
    expect(mockFindAssessmentByAccountId).toHaveBeenCalledTimes(1)
    expect(mockPersistAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: account.id, matched: false }),
    )
  })

  it("propagates an assessment-lookup failure", async () => {
    const error = new UnknownRepositoryError("assessments down")
    mockFindAssessmentByAccountId.mockResolvedValue(error)

    expect(await evaluateWindDownCohortMatch({ account: makeAccount() })).toBe(error)
    expect(mockPersistAssessment).not.toHaveBeenCalled()
  })

  it("propagates a persist failure", async () => {
    withUser(MX_PHONE)
    const error = new UnknownRepositoryError("assessments down")
    mockPersistAssessment.mockResolvedValue(error)

    expect(await evaluateWindDownCohortMatch({ account: makeAccount() })).toBe(error)
  })

  it("propagates a gathering failure instead of assessing", async () => {
    const error = new UnknownRepositoryError("users down")
    mockFindById.mockResolvedValue(error)

    expect(await evaluateWindDownCohortMatch({ account: makeAccount() })).toBe(error)
    expect(mockPersistAssessment).not.toHaveBeenCalled()
  })

  it("never touches the assessment repository while the flag is off", async () => {
    mockGetWindDownConfig.mockReturnValue(flagsConfig({ usePersistedCohortFlag: false }))
    withUser(MX_PHONE)

    const result = await evaluateWindDownCohortMatch({ account: makeAccount() })

    expect(result).toEqual({ matched: true, matchedCountry: "MX" })
    expect(mockFindAssessmentByAccountId).not.toHaveBeenCalled()
    expect(mockPersistAssessment).not.toHaveBeenCalled()
    expect(mockFindLastByAccountIdBefore).not.toHaveBeenCalled()
  })
})
