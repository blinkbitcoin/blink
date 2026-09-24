jest.mock("@/services/mongoose/schema", () => ({}))
jest.mock("@/domain/errors", () => ({
  CouldNotFindUserFromPhoneError: class extends Error {},
  RepositoryError: class extends Error {},
}))

import { translateToUser } from "@/services/mongoose/users"

describe("translateToUser", () => {
  it("returns epoch date when createdAt is missing", () => {
    const record = {
      userId: "test-user-id",
    } as UserRecord

    const user = translateToUser(record)

    expect(user.createdAt).toBeInstanceOf(Date)
    expect(user.createdAt.getTime()).toBe(0)
  })

  it("preserves createdAt when present", () => {
    const date = new Date("2024-01-15T12:00:00Z")
    const record = {
      userId: "test-user-id",
      createdAt: date,
    } as UserRecord

    const user = translateToUser(record)

    expect(user.createdAt).toBe(date)
  })
})
