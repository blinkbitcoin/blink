import {
  InvalidNotificationCategoryError,
  InvalidNotificationBodyError,
  InvalidNotificationTitleError,
  checkedToLocalizedNotificationBody,
  checkedToLocalizedNotificationContentsMap,
  checkedToLocalizedNotificationTitle,
  checkedToNotificationCategory,
  DuplicateLocalizedNotificationContentError,
  BulletinKeyMaxLength,
  BulletinOptionsWithoutBulletinError,
  InvalidBulletinKeyError,
  checkedBulletinOptions,
  checkedToBulletinKey,
  checkedToBulletinUserIds,
  NotificationBulletinsMaxUserIds,
  TooManyBulletinUserIdsError,
} from "@/domain/notifications"
import { InvalidUserId } from "@/domain/errors"

describe("checkedToNotificationCategory", () => {
  it("passes when category is valid", () => {
    const category = "Circles"
    expect(checkedToNotificationCategory("Circles")).toBe(category)
  })

  it("fails when category is invalid", () => {
    expect(checkedToNotificationCategory("")).toBeInstanceOf(
      InvalidNotificationCategoryError,
    )
  })
})

describe("checkedToLocalizedPushTitle", () => {
  it("passes when title is valid", () => {
    const title = "Circle Grew"
    expect(checkedToLocalizedNotificationTitle("Circle Grew")).toBe(title)
  })

  it("fails when title is empty", () => {
    expect(checkedToLocalizedNotificationTitle("")).toBeInstanceOf(
      InvalidNotificationTitleError,
    )
  })
})

describe("localized push body check", () => {
  it("passes when body in valid", () => {
    const body = "Your inner circle grew!"
    expect(checkedToLocalizedNotificationBody("Your inner circle grew!")).toBe(body)
  })

  it("fails when body is empty", () => {
    expect(checkedToLocalizedNotificationBody("")).toBeInstanceOf(
      InvalidNotificationBodyError,
    )
  })
})

describe("localized push contents map check", () => {
  it("passes when contents are valid", () => {
    const contents = [
      { title: "Title", body: "Body", language: "en" },
      { title: "Titulo", body: "Cuerpo", language: "es" },
    ]
    expect(checkedToLocalizedNotificationContentsMap(contents)).toBeInstanceOf(Map)
  })

  it("fails when there are duplicate languages", () => {
    const contents = [
      { title: "Title", body: "Body", language: "en" },
      { title: "Title", body: "Body", language: "en" },
    ]
    expect(checkedToLocalizedNotificationContentsMap(contents)).toBeInstanceOf(
      DuplicateLocalizedNotificationContentError,
    )
  })

  it("fails when title is invalid", () => {
    const contents = [{ title: "", body: "Body", language: "en" }]
    expect(checkedToLocalizedNotificationContentsMap(contents)).toBeInstanceOf(
      InvalidNotificationTitleError,
    )
  })

  it("fails when body is invalid", () => {
    const contents = [{ title: "Title", body: "", language: "en" }]
    expect(checkedToLocalizedNotificationContentsMap(contents)).toBeInstanceOf(
      InvalidNotificationBodyError,
    )
  })
})

describe("checkedToBulletinKey", () => {
  it("passes when key is a valid slug", () => {
    expect(checkedToBulletinKey("feature-rollout_2")).toEqual("feature-rollout_2")
  })

  it("normalizes the key trimming and lowercasing it", () => {
    expect(checkedToBulletinKey("  Feature-Rollout  ")).toEqual("feature-rollout")
  })

  it("passes when key has the max length", () => {
    expect(checkedToBulletinKey("a".repeat(BulletinKeyMaxLength))).toEqual(
      "a".repeat(BulletinKeyMaxLength),
    )
  })

  it("fails when key exceeds the max length", () => {
    expect(checkedToBulletinKey("a".repeat(BulletinKeyMaxLength + 1))).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
  })

  it("fails when key is empty", () => {
    expect(checkedToBulletinKey("")).toBeInstanceOf(InvalidBulletinKeyError)
    expect(checkedToBulletinKey("   ")).toBeInstanceOf(InvalidBulletinKeyError)
  })

  it("fails when key is undefined or null", () => {
    expect(checkedToBulletinKey(undefined as unknown as string)).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
    expect(checkedToBulletinKey(null as unknown as string)).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
  })

  it("fails when key has invalid characters", () => {
    expect(checkedToBulletinKey("feature rollout")).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
    expect(checkedToBulletinKey("feature.rollout")).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
    expect(checkedToBulletinKey("función")).toBeInstanceOf(InvalidBulletinKeyError)
  })

  it("fails when key has misplaced separators", () => {
    expect(checkedToBulletinKey("-feature")).toBeInstanceOf(InvalidBulletinKeyError)
    expect(checkedToBulletinKey("feature_")).toBeInstanceOf(InvalidBulletinKeyError)
    expect(checkedToBulletinKey("feature--rollout")).toBeInstanceOf(
      InvalidBulletinKeyError,
    )
  })
})

describe("checkedBulletinOptions", () => {
  it("passes with defaults when no bulletin options are set", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: false,
        bulletinKey: undefined,
        dismissible: true,
      }),
    ).toEqual({ bulletinKey: undefined, dismissible: true })
  })

  it("passes with defaults when key is null", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: false,
        bulletinKey: null,
        dismissible: true,
      }),
    ).toEqual({ bulletinKey: undefined, dismissible: true })
  })

  it("passes with a normalized key and non dismissible bulletin", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: true,
        bulletinKey: " Feature-Rollout ",
        dismissible: false,
      }),
    ).toEqual({ bulletinKey: "feature-rollout", dismissible: false })
  })

  it("fails when key is set without bulletin", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: false,
        bulletinKey: "feature-rollout",
        dismissible: true,
      }),
    ).toBeInstanceOf(BulletinOptionsWithoutBulletinError)
  })

  it("fails when non dismissible is set without bulletin", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: false,
        bulletinKey: undefined,
        dismissible: false,
      }),
    ).toBeInstanceOf(BulletinOptionsWithoutBulletinError)
  })

  it("fails when key is invalid", () => {
    expect(
      checkedBulletinOptions({
        shouldAddToBulletin: true,
        bulletinKey: "invalid key",
        dismissible: true,
      }),
    ).toBeInstanceOf(InvalidBulletinKeyError)
  })
})

describe("checkedToBulletinUserIds", () => {
  const userIdAt = (index: number) =>
    `5a9b1a9e-6b2e-4c4e-8f0b-${index.toString().padStart(12, "0")}`

  it("passes with unique valid user ids", () => {
    expect(checkedToBulletinUserIds([userIdAt(1), userIdAt(2)])).toEqual([
      userIdAt(1),
      userIdAt(2),
    ])
  })

  it("removes duplicated user ids", () => {
    expect(checkedToBulletinUserIds([userIdAt(1), userIdAt(1)])).toEqual([userIdAt(1)])
  })

  it("passes with the max number of user ids", () => {
    const userIds = Array.from({ length: NotificationBulletinsMaxUserIds }, (_, i) =>
      userIdAt(i),
    )
    expect(checkedToBulletinUserIds(userIds)).toEqual(userIds)
  })

  it("fails when user ids exceed the max", () => {
    const userIds = Array.from({ length: NotificationBulletinsMaxUserIds + 1 }, (_, i) =>
      userIdAt(i),
    )
    expect(checkedToBulletinUserIds(userIds)).toBeInstanceOf(TooManyBulletinUserIdsError)
  })

  it("fails when a user id is invalid", () => {
    expect(checkedToBulletinUserIds([userIdAt(1), "invalid"])).toBeInstanceOf(
      InvalidUserId,
    )
  })
})
