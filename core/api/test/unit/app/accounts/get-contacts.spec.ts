jest.mock("@/services/mongoose", () => ({
  ContactsRepository: jest.fn(),
}))

import { getContactByUsername, getContactsByAccountId } from "@/app/accounts/get-contacts"

import {
  CouldNotFindContactFromAccountIdError,
  InvalidHandleError,
} from "@/domain/contacts/errors"
import { NoContactForUsernameError, UnknownRepositoryError } from "@/domain/errors"
import { ContactsRepository } from "@/services/mongoose"

const mockContactsRepository = ContactsRepository as jest.MockedFunction<
  typeof ContactsRepository
>

const accountId = "account-id" as AccountId

const contact = {
  id: "contact-id" as ContactId,
  createdAt: new Date(),
  accountId,
  type: "INTRALEDGER" as ContactType,
  handle: "legacyuser" as Handle,
  displayName: "Legacy" as ContactAlias,
  transactionsCount: 3,
}

const mockFindByHandle = jest.fn()
const mockListByAccountId = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockContactsRepository.mockReturnValue({
    findByHandle: mockFindByHandle,
    listByAccountId: mockListByAccountId,
  } as unknown as IContactsRepository)
})

describe("getContactByUsername", () => {
  it("returns the contact for a legacy username", async () => {
    mockFindByHandle.mockResolvedValue(contact)

    const result = await getContactByUsername({ accountId, handle: "legacyuser" })

    expect(mockFindByHandle).toHaveBeenCalledWith({ accountId, handle: "legacyuser" })
    expect(result).toEqual({
      id: "legacyuser",
      username: "legacyuser",
      handle: "legacyuser",
      alias: "Legacy",
      transactionsCount: 3,
    })
  })

  it("fails with NoContactForUsernameError when the contact is missing", async () => {
    mockFindByHandle.mockResolvedValue(
      new CouldNotFindContactFromAccountIdError(accountId),
    )

    const result = await getContactByUsername({ accountId, handle: "unknown" })

    expect(result).toBeInstanceOf(NoContactForUsernameError)
  })

  it("fails with a validation error when the handle is malformed", async () => {
    const result = await getContactByUsername({ accountId, handle: "not a handle!" })

    expect(result).toBeInstanceOf(InvalidHandleError)
    expect(mockFindByHandle).not.toHaveBeenCalled()
  })
})

describe("getContactsByAccountId", () => {
  it("returns every contact of the account", async () => {
    mockListByAccountId.mockResolvedValue([
      contact,
      { ...contact, handle: "alice@blink.sv" as Handle },
    ])

    const result = await getContactsByAccountId({ accountId })

    expect(result).toEqual([
      expect.objectContaining({ handle: "legacyuser" }),
      expect.objectContaining({ handle: "alice@blink.sv" }),
    ])
  })

  it("returns an empty list when the account has no contact", async () => {
    mockListByAccountId.mockResolvedValue([])

    const result = await getContactsByAccountId({ accountId })

    expect(result).toEqual([])
  })

  it("propagates a repository failure", async () => {
    mockListByAccountId.mockResolvedValue(new UnknownRepositoryError("boom"))

    const result = await getContactsByAccountId({ accountId })

    expect(result).toBeInstanceOf(UnknownRepositoryError)
  })
})
