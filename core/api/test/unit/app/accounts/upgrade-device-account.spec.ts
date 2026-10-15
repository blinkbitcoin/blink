jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  UsersRepository: jest.fn(),
  WindDownCohortAssessmentsRepository: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { upgradeAccountFromDeviceToPhone } from "@/app/accounts/upgrade-device-account"

import { AccountLevel } from "@/domain/accounts"
import { UnknownRepositoryError } from "@/domain/errors"
import { ErrorLevel } from "@/domain/shared"
import {
  AccountsRepository,
  UsersRepository,
  WindDownCohortAssessmentsRepository,
} from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockUsersRepository = UsersRepository as jest.MockedFunction<typeof UsersRepository>
const mockAccountsRepository = AccountsRepository as jest.MockedFunction<
  typeof AccountsRepository
>
const mockAssessmentsRepository =
  WindDownCohortAssessmentsRepository as jest.MockedFunction<
    typeof WindDownCohortAssessmentsRepository
  >
const mockRecordException = recordExceptionInCurrentSpan as jest.MockedFunction<
  typeof recordExceptionInCurrentSpan
>

const mockFindUserById = jest.fn()
const mockUpdateUser = jest.fn()
const mockFindAccountByUserId = jest.fn()
const mockUpdateAccount = jest.fn()
const mockDeleteByAccountId = jest.fn()

const userId = "user-id" as UserId
const phone = "+50370000000" as PhoneNumber
const accountId = "account-id" as AccountId

const user = { id: userId, phone: undefined, deletedPhones: [] }
const account = { id: accountId, level: AccountLevel.Zero } as Account

describe("upgradeAccountFromDeviceToPhone", () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockUsersRepository.mockReturnValue({
      findById: mockFindUserById,
      update: mockUpdateUser,
    } as unknown as ReturnType<typeof UsersRepository>)
    mockAccountsRepository.mockReturnValue({
      findByUserId: mockFindAccountByUserId,
      update: mockUpdateAccount,
    } as unknown as ReturnType<typeof AccountsRepository>)
    mockAssessmentsRepository.mockReturnValue({
      deleteByAccountId: mockDeleteByAccountId,
    } as unknown as ReturnType<typeof WindDownCohortAssessmentsRepository>)

    mockFindUserById.mockResolvedValue({ ...user })
    mockUpdateUser.mockImplementation(async (updated) => updated)
    mockFindAccountByUserId.mockResolvedValue({ ...account })
    mockUpdateAccount.mockImplementation(async (updated) => updated)
    mockDeleteByAccountId.mockResolvedValue(true)
  })

  it("resets the cohort assessment after the account is upgraded", async () => {
    const result = await upgradeAccountFromDeviceToPhone({ userId, phone })

    expect(result).toEqual(
      expect.objectContaining({ id: accountId, level: AccountLevel.One }),
    )
    expect(mockDeleteByAccountId).toHaveBeenCalledWith(accountId)
    expect(mockDeleteByAccountId.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockUpdateAccount.mock.invocationCallOrder[0],
    )
    expect(mockRecordException).not.toHaveBeenCalled()
  })

  it("records a warning and still returns the account when the reset fails", async () => {
    const error = new UnknownRepositoryError("assessments down")
    mockDeleteByAccountId.mockResolvedValue(error)

    const result = await upgradeAccountFromDeviceToPhone({ userId, phone })

    expect(result).toEqual(
      expect.objectContaining({ id: accountId, level: AccountLevel.One }),
    )
    expect(mockRecordException).toHaveBeenCalledWith({ error, level: ErrorLevel.Warn })
  })

  it("does not touch the assessment when the user lookup fails", async () => {
    const error = new UnknownRepositoryError("users down")
    mockFindUserById.mockResolvedValue(error)

    const result = await upgradeAccountFromDeviceToPhone({ userId, phone })

    expect(result).toBe(error)
    expect(mockDeleteByAccountId).not.toHaveBeenCalled()
  })

  it("does not touch the assessment when the account update fails", async () => {
    const error = new UnknownRepositoryError("accounts down")
    mockUpdateAccount.mockResolvedValue(error)

    const result = await upgradeAccountFromDeviceToPhone({ userId, phone })

    expect(result).toBe(error)
    expect(mockDeleteByAccountId).not.toHaveBeenCalled()
  })
})
