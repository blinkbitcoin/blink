import { checkedToUserId } from "@/domain/accounts"
import { checkedToBulletinKey } from "@/domain/notifications"
import { AccountsRepository } from "@/services/mongoose"
import { NotificationsService } from "@/services/notifications"

export const closeNotificationBulletin = async ({
  userId: userIdRaw,
  bulletinKey: bulletinKeyRaw,
}: AdminCloseNotificationBulletinArgs): Promise<true | ApplicationError> => {
  const userId = checkedToUserId(userIdRaw)
  if (userId instanceof Error) return userId

  const bulletinKey = checkedToBulletinKey(bulletinKeyRaw)
  if (bulletinKey instanceof Error) return bulletinKey

  const account = await AccountsRepository().findByUserId(userId)
  if (account instanceof Error) return account

  return NotificationsService().closeBulletin({
    userId: account.kratosUserId,
    bulletinKey,
  })
}
