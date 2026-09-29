jest.mock("@/services/mongoose", () => ({
  __mockFindAccountByUserId: jest.fn(),
  AccountsRepository: () => ({
    findByUserId: jest.requireMock("@/services/mongoose").__mockFindAccountByUserId,
  }),
}))

jest.mock("@/services/notifications", () => ({
  __mockCloseBulletin: jest.fn(),
  NotificationsService: () => ({
    closeBulletin: jest.requireMock("@/services/notifications").__mockCloseBulletin,
  }),
}))

import { closeNotificationBulletin } from "@/app/admin/close-notification-bulletin"
import { CouldNotFindAccountFromKratosIdError, InvalidUserId } from "@/domain/errors"
import { InvalidBulletinKeyError } from "@/domain/notifications"

const mockFindAccountByUserId = jest.requireMock("@/services/mongoose")
  .__mockFindAccountByUserId as jest.Mock
const mockCloseBulletin = jest.requireMock("@/services/notifications")
  .__mockCloseBulletin as jest.Mock

describe("closeNotificationBulletin", () => {
  const userId = "5a9b1a9e-6b2e-4c4e-8f0b-3f1f3c6e9d21"

  beforeEach(() => {
    jest.clearAllMocks()
    mockFindAccountByUserId.mockResolvedValue({ kratosUserId: userId })
    mockCloseBulletin.mockResolvedValue(true)
  })

  it("closes the bulletin with the normalized key", async () => {
    const result = await closeNotificationBulletin({
      userId,
      bulletinKey: " Feature-Rollout ",
    })

    expect(result).toBe(true)
    expect(mockCloseBulletin).toHaveBeenCalledWith({
      userId,
      bulletinKey: "feature-rollout",
    })
  })

  it("fails to close bulletin - invalid user id", async () => {
    const result = await closeNotificationBulletin({
      userId: "invalid-user-id",
      bulletinKey: "feature-rollout",
    })

    expect(result).toBeInstanceOf(InvalidUserId)
    expect(mockCloseBulletin).not.toHaveBeenCalled()
  })

  it("fails to close bulletin - invalid bulletin key", async () => {
    const result = await closeNotificationBulletin({
      userId,
      bulletinKey: "invalid key",
    })

    expect(result).toBeInstanceOf(InvalidBulletinKeyError)
    expect(mockCloseBulletin).not.toHaveBeenCalled()
  })

  it("fails to close bulletin - account not found", async () => {
    mockFindAccountByUserId.mockResolvedValue(
      new CouldNotFindAccountFromKratosIdError(userId),
    )

    const result = await closeNotificationBulletin({
      userId,
      bulletinKey: "feature-rollout",
    })

    expect(result).toBeInstanceOf(CouldNotFindAccountFromKratosIdError)
    expect(mockCloseBulletin).not.toHaveBeenCalled()
  })
})
