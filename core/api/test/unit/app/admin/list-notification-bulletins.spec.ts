jest.mock("@/services/notifications", () => ({
  __mockListLatestBulletins: jest.fn(),
  NotificationsService: () => ({
    listLatestBulletins: jest.requireMock("@/services/notifications")
      .__mockListLatestBulletins,
  }),
}))

import { listNotificationBulletins } from "@/app/admin/list-notification-bulletins"
import {
  InvalidBulletinKeyError,
  NotificationBulletinsMaxUserIds,
  TooManyBulletinUserIdsError,
} from "@/domain/notifications"

const mockListLatestBulletins = jest.requireMock("@/services/notifications")
  .__mockListLatestBulletins as jest.Mock

describe("listNotificationBulletins", () => {
  const userId = "5a9b1a9e-6b2e-4c4e-8f0b-3f1f3c6e9d21"
  const bulletin = {
    id: "bulletin-id",
    userId,
    createdAt: new Date(),
    acknowledgedAt: undefined,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockListLatestBulletins.mockResolvedValue([bulletin])
  })

  it("lists bulletins with the normalized key", async () => {
    const result = await listNotificationBulletins({
      userIds: [userId],
      bulletinKey: " Feature-Rollout ",
    })

    expect(result).toEqual([bulletin])
    expect(mockListLatestBulletins).toHaveBeenCalledWith({
      userIds: [userId],
      bulletinKey: "feature-rollout",
    })
  })

  it("returns an empty list without calling the service when there are no user ids", async () => {
    const result = await listNotificationBulletins({
      userIds: [],
      bulletinKey: "feature-rollout",
    })

    expect(result).toEqual([])
    expect(mockListLatestBulletins).not.toHaveBeenCalled()
  })

  it("fails to list bulletins - too many user ids", async () => {
    const userIds = Array.from(
      { length: NotificationBulletinsMaxUserIds + 1 },
      (_, i) => `5a9b1a9e-6b2e-4c4e-8f0b-${i.toString().padStart(12, "0")}`,
    )

    const result = await listNotificationBulletins({
      userIds,
      bulletinKey: "feature-rollout",
    })

    expect(result).toBeInstanceOf(TooManyBulletinUserIdsError)
    expect(mockListLatestBulletins).not.toHaveBeenCalled()
  })

  it("fails to list bulletins - invalid bulletin key", async () => {
    const result = await listNotificationBulletins({
      userIds: [userId],
      bulletinKey: "invalid key",
    })

    expect(result).toBeInstanceOf(InvalidBulletinKeyError)
    expect(mockListLatestBulletins).not.toHaveBeenCalled()
  })
})
