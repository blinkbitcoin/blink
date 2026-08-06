jest.mock("@/app/authentication/ratelimits", () => ({
  checkFailedLoginAttemptPerIpLimits: jest.fn().mockResolvedValue(true),
  checkLoginAttemptPerLoginIdentifierLimits: jest.fn().mockResolvedValue(true),
  rewardFailedLoginAttemptPerIpLimits: jest.fn().mockResolvedValue(true),
}))

jest.mock("@/app/authentication/get-phone-metadata", () => ({
  getPhoneMetadata: jest.fn(),
}))

jest.mock("@/app/accounts", () => ({ markAccountForDeletion: jest.fn() }))

jest.mock("@/services/phone-provider", () => ({
  isPhoneCodeValid: jest.fn().mockResolvedValue(true),
}))

jest.mock("@/services/mongoose", () => ({
  UsersRepository: () => jest.requireMock("@/services/mongoose").__usersRepo,
  __usersRepo: {},
}))
jest.mock("@/services/mongoose/users", () => ({
  UsersRepository: () => jest.requireMock("@/services/mongoose").__usersRepo,
}))
jest.mock("@/services/mongoose/accounts", () => ({
  AccountsRepository: () => jest.requireMock("@/services/mongoose").__accountsRepo,
}))

jest.mock("@/services/kratos", () => ({
  AuthWithEmailPasswordlessService: () => ({
    addPhoneToIdentity: jest.fn().mockResolvedValue(true),
  }),
  AuthWithPhonePasswordlessService: () => ({
    updatePhone: jest.fn().mockResolvedValue(true),
  }),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncToRunInSpan: ({ fn }: { fn: unknown }) => fn,
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: unknown }) => fns,
}))

import { verifyPhone } from "@/app/authentication/phone"
import { getPhoneMetadata } from "@/app/authentication/get-phone-metadata"
import { updateUserPhone } from "@/app/admin/update-user-phone"

import { retainedPhoneMetadata } from "@/domain/users"
import {
  InvalidPhoneForOnboardingError,
  InvalidPhoneMetadataForOnboardingError,
} from "@/domain/users/errors"
import { CouldNotFindUserFromPhoneError } from "@/domain/errors"

const mongooseMock = jest.requireMock("@/services/mongoose") as {
  __usersRepo: Record<string, jest.Mock>
  __accountsRepo: Record<string, jest.Mock>
}
const mockGetPhoneMetadata = getPhoneMetadata as jest.MockedFunction<
  typeof getPhoneMetadata
>

const PHONE = "+50361234567" as PhoneNumber
const CODE = "000000" as PhoneCode
const IP = "203.0.113.7" as IpAddress

const metadata = (countryCode: string): PhoneMetadata =>
  ({ countryCode, carrier: {} }) as PhoneMetadata

const accountId = crypto.randomUUID() as AccountId
const kratosUserId = crypto.randomUUID() as UserId

const findById = jest.fn()
const update = jest.fn()
const findByPhone = jest.fn()
const findAccountById = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mongooseMock.__usersRepo = { findById, update, findByPhone }
  mongooseMock.__accountsRepo = { findById: findAccountById }
  update.mockImplementation(async (user) => user)
  findByPhone.mockResolvedValue(new CouldNotFindUserFromPhoneError())
  findAccountById.mockResolvedValue({
    id: accountId,
    status: "active",
    kratosUserId,
  } as unknown as Account)
})

describe("retainedPhoneMetadata", () => {
  it("keeps the stored country when the vendor resolved none", () => {
    expect(
      retainedPhoneMetadata({ fetched: metadata(""), stored: metadata("NG") }),
    ).toEqual(metadata("NG"))
  })

  it("keeps the stored value when nothing was fetched", () => {
    expect(retainedPhoneMetadata({ fetched: undefined, stored: metadata("NG") })).toEqual(
      metadata("NG"),
    )
  })

  it("takes a freshly resolved country over the stored one", () => {
    expect(
      retainedPhoneMetadata({ fetched: metadata("SV"), stored: metadata("NG") }),
    ).toEqual(metadata("SV"))
  })

  it("accepts a country-less answer when nothing was stored", () => {
    expect(retainedPhoneMetadata({ fetched: metadata(""), stored: undefined })).toEqual(
      metadata(""),
    )
  })
})

describe("verifyPhone", () => {
  it("propagates a denied country instead of attaching the phone", async () => {
    findById.mockResolvedValue({ id: kratosUserId })
    mockGetPhoneMetadata.mockResolvedValue(new InvalidPhoneForOnboardingError())

    const result = await verifyPhone({
      userId: kratosUserId,
      phone: PHONE,
      code: CODE,
      ip: IP,
    })

    expect(result).toBeInstanceOf(InvalidPhoneForOnboardingError)
    expect(update).not.toHaveBeenCalled()
  })

  it("attaches the phone and keeps the last verified country when the vendor is down", async () => {
    findById.mockResolvedValue({ id: kratosUserId, phoneMetadata: metadata("NG") })
    mockGetPhoneMetadata.mockResolvedValue(new InvalidPhoneMetadataForOnboardingError())

    await verifyPhone({ userId: kratosUserId, phone: PHONE, code: CODE, ip: IP })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, phoneMetadata: metadata("NG") }),
    )
  })

  it("does not overwrite a stored country with a country-less answer", async () => {
    findById.mockResolvedValue({ id: kratosUserId, phoneMetadata: metadata("NG") })
    mockGetPhoneMetadata.mockResolvedValue(metadata(""))

    await verifyPhone({ userId: kratosUserId, phone: PHONE, code: CODE, ip: IP })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ phoneMetadata: metadata("NG") }),
    )
  })

  it("captures the resolved country on a clean lookup", async () => {
    findById.mockResolvedValue({ id: kratosUserId })
    mockGetPhoneMetadata.mockResolvedValue(metadata("SV"))

    await verifyPhone({ userId: kratosUserId, phone: PHONE, code: CODE, ip: IP })

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, phoneMetadata: metadata("SV") }),
    )
  })
})

describe("updateUserPhone", () => {
  const args = {
    accountId,
    phone: PHONE,
    updatedByPrivilegedClientId: "client" as PrivilegedClientId,
  }

  it("propagates a denied country instead of moving the phone", async () => {
    findById.mockResolvedValue({ id: kratosUserId })
    mockGetPhoneMetadata.mockResolvedValue(new InvalidPhoneForOnboardingError())

    const result = await updateUserPhone(args)

    expect(result).toBeInstanceOf(InvalidPhoneForOnboardingError)
    expect(update).not.toHaveBeenCalled()
  })

  it("does not overwrite a stored country with a country-less answer", async () => {
    findById.mockResolvedValue({ id: kratosUserId, phoneMetadata: metadata("NG") })
    mockGetPhoneMetadata.mockResolvedValue(metadata(""))

    await updateUserPhone(args)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, phoneMetadata: metadata("NG") }),
    )
  })

  it("refreshes the country when the new number resolves", async () => {
    findById.mockResolvedValue({ id: kratosUserId, phoneMetadata: metadata("NG") })
    mockGetPhoneMetadata.mockResolvedValue(metadata("SV"))

    await updateUserPhone(args)

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ phoneMetadata: metadata("SV") }),
    )
  })
})
