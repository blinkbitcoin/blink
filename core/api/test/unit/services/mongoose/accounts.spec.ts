jest.mock("@/services/mongoose/schema", () => ({
  __mocks: {
    save: jest.fn(),
  },
  // the minimal record shape translateToAccount reads back after save()
  Account: class {
    id = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
    created_at = new Date()
    statusHistory = [{ status: "active" }]
    kratosUserId?: string
    last_activity_at?: Date
    save = jest.requireMock("@/services/mongoose/schema").__mocks.save
  },
}))

import { AccountsRepository } from "@/services/mongoose/accounts"

const { save: mockSave } = jest.requireMock("@/services/mongoose/schema").__mocks as {
  save: jest.Mock
}

describe("AccountsRepository.persistNew", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("stamps last_activity_at with a creation-time Date before save()", async () => {
    let savedAt: unknown
    mockSave.mockImplementation(async function (this: { last_activity_at?: Date }) {
      savedAt = this.last_activity_at
      return this
    })
    const before = Date.now()

    const account = await AccountsRepository().persistNew("kratos-user-id" as UserId)

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(savedAt).toBeInstanceOf(Date)
    if (!(savedAt instanceof Date)) throw new Error("unreachable")
    expect(savedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(savedAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(account).not.toBeInstanceOf(Error)
    if (account instanceof Error) throw account
    expect(account.lastActivityAt).toEqual(savedAt)
  })
})
