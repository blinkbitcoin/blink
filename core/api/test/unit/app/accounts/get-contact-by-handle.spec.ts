jest.mock("@/services/mongoose", () => ({
  ContactsRepository: jest.fn(),
}))

import { getContactByHandle } from "@/app/accounts/get-contact-by-handle"

import {
  CouldNotFindContactFromAccountIdError,
  CouldNotUpdateContactError,
  InvalidHandleError,
} from "@/domain/contacts/errors"
import { NoContactForHandleError } from "@/domain/errors"
import { ContactsRepository } from "@/services/mongoose"

const mockContactsRepository = ContactsRepository as jest.MockedFunction<
  typeof ContactsRepository
>

const accountId = "account-id" as AccountId

const contact = {
  id: "contact-id" as ContactId,
  createdAt: new Date(),
  accountId,
  type: "LNADDRESS" as ContactType,
  handle: "alice@blink.sv" as Handle,
  displayName: "Alice" as ContactAlias,
  transactionsCount: 11,
}

const mockFindByHandle = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  mockContactsRepository.mockReturnValue({
    findByHandle: mockFindByHandle,
  } as unknown as IContactsRepository)
})

describe("getContactByHandle", () => {
  it("returns the contact for an address hosted by this instance", async () => {
    mockFindByHandle.mockResolvedValue(contact)

    const result = await getContactByHandle({ accountId, handle: "alice@blink.sv" })

    expect(mockFindByHandle).toHaveBeenCalledWith({
      accountId,
      handle: "alice@blink.sv",
    })
    expect(result).toEqual({
      id: "alice@blink.sv",
      username: "alice@blink.sv",
      handle: "alice@blink.sv",
      alias: "Alice",
      transactionsCount: 11,
    })
  })

  it("returns the contact for an address hosted by another wallet", async () => {
    mockFindByHandle.mockResolvedValue({
      ...contact,
      handle: "bob@otherwallet.example" as Handle,
    })

    const result = await getContactByHandle({
      accountId,
      handle: "bob@otherwallet.example",
    })

    expect(result).toHaveProperty("handle", "bob@otherwallet.example")
  })

  it("returns the contact for a legacy username", async () => {
    mockFindByHandle.mockResolvedValue({ ...contact, handle: "legacyuser" as Handle })

    const result = await getContactByHandle({ accountId, handle: "legacyuser" })

    expect(mockFindByHandle).toHaveBeenCalledWith({ accountId, handle: "legacyuser" })
    expect(result).toHaveProperty("handle", "legacyuser")
  })

  it("looks the contact up by its normalized handle", async () => {
    mockFindByHandle.mockResolvedValue(contact)

    await getContactByHandle({ accountId, handle: "  Alice@Blink.SV  " })

    expect(mockFindByHandle).toHaveBeenCalledWith({
      accountId,
      handle: "alice@blink.sv",
    })
  })

  it("fails with NoContactForHandleError when the handle is unknown", async () => {
    mockFindByHandle.mockResolvedValue(
      new CouldNotFindContactFromAccountIdError(accountId),
    )

    const result = await getContactByHandle({ accountId, handle: "unknown@blink.sv" })

    expect(result).toBeInstanceOf(NoContactForHandleError)
    expect(result).toHaveProperty("message", "unknown@blink.sv")
  })

  it("fails with a validation error when the handle is malformed", async () => {
    const result = await getContactByHandle({ accountId, handle: "not a handle!" })

    expect(result).toBeInstanceOf(InvalidHandleError)
    expect(mockFindByHandle).not.toHaveBeenCalled()
  })

  it("propagates a repository failure instead of masking it as a missing contact", async () => {
    mockFindByHandle.mockResolvedValue(new CouldNotUpdateContactError())

    const result = await getContactByHandle({ accountId, handle: "alice@blink.sv" })

    expect(result).toBeInstanceOf(CouldNotUpdateContactError)
  })
})
