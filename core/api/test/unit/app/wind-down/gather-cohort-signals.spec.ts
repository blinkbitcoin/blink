jest.mock("@/services/mongoose", () => ({
  UsersRepository: jest.fn(),
}))

jest.mock("@/services/mongoose/accounts-ips", () => ({
  AccountsIpsRepository: jest.fn(),
}))

import { gatherCohortSignals } from "@/app/wind-down/gather-cohort-signals"

import { CouldNotFindAccountIpError, UnknownRepositoryError } from "@/domain/errors"
import { UsersRepository } from "@/services/mongoose"
import { AccountsIpsRepository } from "@/services/mongoose/accounts-ips"

const mockUsersRepository = UsersRepository as jest.MockedFunction<typeof UsersRepository>
const mockAccountsIpsRepository = AccountsIpsRepository as jest.MockedFunction<
  typeof AccountsIpsRepository
>

const mockFindById = jest.fn()
const mockFindEarliestByAccountId = jest.fn()
const mockFindLastByAccountIdBefore = jest.fn()

const accountId = "account-id" as AccountId
const kratosUserId = "user-id" as UserId
const cutoff = new Date("2026-07-01T00:00:00Z")

const GT_PHONE = "+50251234567"
const MX_PHONE = "+525512345678"
const AR_PHONE = "+5491123456789"

describe("gatherCohortSignals", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockUsersRepository.mockReturnValue({
      findById: mockFindById,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockAccountsIpsRepository.mockReturnValue({
      findEarliestByAccountId: mockFindEarliestByAccountId,
      findLastByAccountIdBefore: mockFindLastByAccountIdBefore,
    } as unknown as ReturnType<typeof AccountsIpsRepository>)
    mockFindById.mockResolvedValue({ phone: GT_PHONE, deletedPhones: [] })
    mockFindEarliestByAccountId.mockResolvedValue(new CouldNotFindAccountIpError())
    mockFindLastByAccountIdBefore.mockResolvedValue(new CouldNotFindAccountIpError())
  })

  it("reverses the stored deleted phones so the newest comes first", async () => {
    mockFindById.mockResolvedValue({
      phone: undefined,
      deletedPhones: [MX_PHONE, AR_PHONE],
    })

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(
      expect.objectContaining({ deletedPhoneCountries: ["AR", "MX"] }),
    )
  })

  it("keeps unparseable deleted phones as undefined holes in position", async () => {
    mockFindById.mockResolvedValue({
      phone: undefined,
      deletedPhones: [MX_PHONE, "not-a-phone"],
    })

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(
      expect.objectContaining({ deletedPhoneCountries: [undefined, "MX"] }),
    )
  })

  it("derives the phone country from the number, ignoring phoneMetadata.countryCode", async () => {
    mockFindById.mockResolvedValue({
      phone: GT_PHONE,
      phoneMetadata: { countryCode: "MX" },
      deletedPhones: [],
    })

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(expect.objectContaining({ phoneCountry: "GT" }))
  })

  it("leaves the phone country absent for a phone-less user", async () => {
    mockFindById.mockResolvedValue({ phone: undefined, deletedPhones: [] })

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(expect.objectContaining({ phoneCountry: undefined }))
  })

  it("treats a missing earliest accountips row as an absent creation-IP signal", async () => {
    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(expect.objectContaining({ creationIpCountry: undefined }))
  })

  it("treats an earliest row without geo metadata as absent, without falling through", async () => {
    mockFindEarliestByAccountId.mockResolvedValue({ metadata: undefined })

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toEqual(expect.objectContaining({ creationIpCountry: undefined }))
  })

  it("bounds the latest-IP lookup to the cutoff", async () => {
    mockFindLastByAccountIdBefore.mockResolvedValue({ metadata: { isoCode: "MX" } })

    const signals = await gatherCohortSignals({
      accountId,
      kratosUserId,
      ipEvidenceCutoff: cutoff,
    })

    expect(mockFindLastByAccountIdBefore).toHaveBeenCalledWith({ accountId, cutoff })
    expect(signals).toEqual(expect.objectContaining({ latestIpCountry: "MX" }))
  })

  it("skips the latest-IP lookup entirely when no cutoff is given", async () => {
    const signals = await gatherCohortSignals({ accountId, kratosUserId })

    expect(mockFindLastByAccountIdBefore).not.toHaveBeenCalled()
    expect(signals).toEqual({
      phoneCountry: "GT",
      deletedPhoneCountries: [],
      creationIpCountry: undefined,
    })
  })

  it("treats a cutoff-bounded row without geo metadata as an absent latest-IP signal", async () => {
    mockFindLastByAccountIdBefore.mockResolvedValue({ metadata: undefined })

    const signals = await gatherCohortSignals({
      accountId,
      kratosUserId,
      ipEvidenceCutoff: cutoff,
    })
    expect(signals).toEqual(expect.objectContaining({ latestIpCountry: undefined }))
  })

  it("treats no connection at or before the cutoff as an absent latest-IP signal", async () => {
    const signals = await gatherCohortSignals({
      accountId,
      kratosUserId,
      ipEvidenceCutoff: cutoff,
    })
    expect(signals).toEqual(expect.objectContaining({ latestIpCountry: undefined }))
  })

  it("propagates a users-lookup failure", async () => {
    const error = new UnknownRepositoryError("users down")
    mockFindById.mockResolvedValue(error)

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toBe(error)
  })

  it("propagates an earliest-IP failure that is not a not-found", async () => {
    const error = new UnknownRepositoryError("accountips down")
    mockFindEarliestByAccountId.mockResolvedValue(error)

    const signals = await gatherCohortSignals({ accountId, kratosUserId })
    expect(signals).toBe(error)
  })

  it("propagates a latest-IP failure that is not a not-found", async () => {
    const error = new UnknownRepositoryError("accountips down")
    mockFindLastByAccountIdBefore.mockResolvedValue(error)

    const signals = await gatherCohortSignals({
      accountId,
      kratosUserId,
      ipEvidenceCutoff: cutoff,
    })
    expect(signals).toBe(error)
  })
})
