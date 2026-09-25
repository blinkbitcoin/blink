import { GT } from "@/graphql/index"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

const NotificationBulletin = GT.Object<NotificationBulletin>({
  name: "NotificationBulletin",
  description: "Latest bulletin sent to a user for a given bulletin key",
  fields: () => ({
    id: {
      type: GT.NonNullID,
    },
    userId: {
      type: GT.NonNullID,
    },
    createdAt: {
      type: GT.NonNull(Timestamp),
    },
    acknowledgedAt: {
      type: Timestamp,
      description: "Null while the bulletin is still active for the user",
    },
  }),
})

export default NotificationBulletin
