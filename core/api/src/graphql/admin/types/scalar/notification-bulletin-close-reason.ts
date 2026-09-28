import { BulletinCloseReason } from "@/domain/notifications"
import { GT } from "@/graphql/index"

const NotificationBulletinCloseReason = GT.Enum({
  name: "NotificationBulletinCloseReason",
  description: "Why a bulletin is no longer active for the user",
  values: {
    ACKNOWLEDGED: {
      value: BulletinCloseReason.Acknowledged,
      description: "The user dismissed the bulletin",
    },
    CLOSED: {
      value: BulletinCloseReason.Closed,
      description: "An admin closed the bulletin",
    },
    REPLACED: {
      value: BulletinCloseReason.Replaced,
      description: "A newer bulletin with the same key replaced it",
    },
    SUPERSEDED: {
      value: BulletinCloseReason.Superseded,
      description:
        "It arrived after a newer bulletin or a close for the same key, so it was never shown",
    },
  },
})

export default NotificationBulletinCloseReason
