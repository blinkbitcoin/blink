jest.mock("@/services/mongoose/schema", () => ({
  __mocks: {
    save: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
  // the minimal record shape translateToAccount reads back after save()
  Account: class {
    id = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"
    created_at = new Date()
    statusHistory = [{ status: "active" }]
    kratosUserId?: string
    last_activity_at?: Date
    save = jest.requireMock("@/services/mongoose/schema").__mocks.save
    static findOneAndUpdate(...args: unknown[]) {
      return jest
        .requireMock("@/services/mongoose/schema")
        .__mocks.findOneAndUpdate(...args)
    }
  },
}))

import { AccountsRepository } from "@/services/mongoose/accounts"

const { save: mockSave, findOneAndUpdate: mockFindOneAndUpdate } = jest.requireMock(
  "@/services/mongoose/schema",
).__mocks as { save: jest.Mock; findOneAndUpdate: jest.Mock }

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

describe("AccountsRepository.recordActivity", () => {
  const id = "1c2b5a6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" as AccountId
  const now = new Date("2026-09-18T12:00:00.000Z")
  const cutoff = new Date(now.getTime() - 3600 * 1000)

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("uses $max so an out-of-order write can never move the value backward", async () => {
    mockFindOneAndUpdate.mockResolvedValue({ last_activity_at: cutoff })

    await AccountsRepository().recordActivity({ id, now })

    const [, update, options] = mockFindOneAndUpdate.mock.calls[0]
    expect(update).toEqual({ $max: { last_activity_at: now } })
    expect(options).toMatchObject({ returnDocument: "before", lean: true })
  })

  it("without a cutoff, filters on the id alone", async () => {
    mockFindOneAndUpdate.mockResolvedValue({ last_activity_at: cutoff })

    await AccountsRepository().recordActivity({ id, now })

    expect(mockFindOneAndUpdate.mock.calls[0][0]).toEqual({ id })
  })

  it("with a cutoff, matches a missing, null, or older value only", async () => {
    mockFindOneAndUpdate.mockResolvedValue({ last_activity_at: cutoff })

    await AccountsRepository().recordActivity({ id, now, onlyIfOlderThan: cutoff })

    expect(mockFindOneAndUpdate.mock.calls[0][0]).toEqual({
      id,
      $or: [{ last_activity_at: null }, { last_activity_at: { $lt: cutoff } }],
    })
  })

  it("returns the previous value it replaced", async () => {
    const previous = new Date(now.getTime() - 2 * 3600 * 1000)
    mockFindOneAndUpdate.mockResolvedValue({ last_activity_at: previous })

    const result = await AccountsRepository().recordActivity({ id, now })

    expect(result).toEqual({ written: true, previousActivityAt: previous })
  })

  it("returns previousActivityAt undefined when the field was never set", async () => {
    mockFindOneAndUpdate.mockResolvedValue({})

    const result = await AccountsRepository().recordActivity({ id, now })

    expect(result).toEqual({ written: true, previousActivityAt: undefined })
  })

  it("reports written: false when the stored value was already newer", async () => {
    mockFindOneAndUpdate.mockResolvedValue({
      last_activity_at: new Date(now.getTime() + 5000),
    })

    const result = await AccountsRepository().recordActivity({ id, now })

    expect(result).toEqual({ written: false })
  })

  it("reports written: false when a cutoff filter matched nothing", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)

    const result = await AccountsRepository().recordActivity({
      id,
      now,
      onlyIfOlderThan: cutoff,
    })

    expect(result).toEqual({ written: false })
  })

  it("returns an error when the account does not exist", async () => {
    mockFindOneAndUpdate.mockResolvedValue(null)

    const result = await AccountsRepository().recordActivity({ id, now })

    expect(result).toBeInstanceOf(Error)
  })
})
