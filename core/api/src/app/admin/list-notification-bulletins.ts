import { checkedToBulletinKey, checkedToBulletinUserIds } from "@/domain/notifications"
import { NotificationsService } from "@/services/notifications"

export const listNotificationBulletins = async ({
  userIds: userIdsRaw,
  bulletinKey: bulletinKeyRaw,
}: AdminListNotificationBulletinsArgs): Promise<
  NotificationBulletin[] | ApplicationError
> => {
  const userIds = checkedToBulletinUserIds(userIdsRaw)
  if (userIds instanceof Error) return userIds

  const bulletinKey = checkedToBulletinKey(bulletinKeyRaw)
  if (bulletinKey instanceof Error) return bulletinKey

  if (!userIds.length) return []

  return NotificationsService().listLatestBulletins({ userIds, bulletinKey })
}
