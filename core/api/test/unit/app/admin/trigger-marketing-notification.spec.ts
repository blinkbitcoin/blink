jest.mock("@/services/mongoose", () => ({
  __mockFindUsers: jest.fn(),
  UsersRepository: () => ({
    find: jest.requireMock("@/services/mongoose").__mockFindUsers,
  }),
}))

jest.mock("@/services/notifications", () => ({
  __mockTriggerMarketingNotification: jest.fn(),
  NotificationsService: () => ({
    triggerMarketingNotification: jest.requireMock("@/services/notifications")
      .__mockTriggerMarketingNotification,
  }),
}))

import { triggerMarketingNotification } from "@/app/admin/trigger-marketing-notification"
import {
  BulletinOptionsWithoutBulletinError,
  InvalidBulletinKeyError,
} from "@/domain/notifications"

const mockFindUsers = jest.requireMock("@/services/mongoose").__mockFindUsers as jest.Mock
const mockTriggerMarketingNotification = jest.requireMock("@/services/notifications")
  .__mockTriggerMarketingNotification as jest.Mock

describe("triggerMarketingNotification", () => {
  const userId = "5a9b1a9e-6b2e-4c4e-8f0b-3f1f3c6e9d21"

  const baseArgs = {
    userIdsFilter: [userId],
    phoneCountryCodesFilter: undefined,
    openDeepLink: undefined,
    openExternalUrl: undefined,
    shouldSendPush: false,
    shouldAddToHistory: true,
    shouldAddToBulletin: true,
    bulletinKey: undefined,
    dismissible: true,
    localizedNotificationContents: [{ title: "Title", body: "Body", language: "en" }],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockFindUsers.mockImplementation(async function* () {
      yield userId
    })
    mockTriggerMarketingNotification.mockResolvedValue(true)
  })

  it("sends bulletin options with the normalized key", async () => {
    const result = await triggerMarketingNotification({
      ...baseArgs,
      bulletinKey: " Feature-Rollout ",
      dismissible: false,
    })

    expect(result).toBe(true)
    expect(mockTriggerMarketingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: [userId],
        bulletinKey: "feature-rollout",
        dismissible: false,
      }),
    )
  })

  it("sends default bulletin options when none are set", async () => {
    const result = await triggerMarketingNotification(baseArgs)

    expect(result).toBe(true)
    expect(mockTriggerMarketingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ bulletinKey: undefined, dismissible: true }),
    )
  })

  it("fails to trigger notification - bulletin key without bulletin", async () => {
    const result = await triggerMarketingNotification({
      ...baseArgs,
      shouldAddToBulletin: false,
      bulletinKey: "feature-rollout",
    })

    expect(result).toBeInstanceOf(BulletinOptionsWithoutBulletinError)
    expect(mockTriggerMarketingNotification).not.toHaveBeenCalled()
  })

  it("fails to trigger notification - non dismissible without bulletin", async () => {
    const result = await triggerMarketingNotification({
      ...baseArgs,
      shouldAddToBulletin: false,
      dismissible: false,
    })

    expect(result).toBeInstanceOf(BulletinOptionsWithoutBulletinError)
    expect(mockTriggerMarketingNotification).not.toHaveBeenCalled()
  })

  it("fails to trigger notification - invalid bulletin key", async () => {
    const result = await triggerMarketingNotification({
      ...baseArgs,
      bulletinKey: "invalid key",
    })

    expect(result).toBeInstanceOf(InvalidBulletinKeyError)
    expect(mockTriggerMarketingNotification).not.toHaveBeenCalled()
  })
})
