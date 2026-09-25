import { Admin } from "@/app"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import BulletinKey from "@/graphql/admin/types/scalar/bulletin-key"
import NotificationBulletin from "@/graphql/admin/types/object/notification-bulletin"

const NotificationBulletinsQuery = GT.Field<
  null,
  GraphQLAdminContext,
  {
    bulletinKey: BulletinKey | Error
    userIds: string[]
  }
>({
  type: GT.NonNullList(NotificationBulletin),
  description:
    "Latest bulletin per user for the given key. Users without a bulletin for the key are omitted",
  args: {
    bulletinKey: { type: GT.NonNull(BulletinKey) },
    userIds: { type: GT.NonNullList(GT.ID) },
  },
  resolve: async (_, { bulletinKey, userIds }) => {
    if (bulletinKey instanceof Error) throw bulletinKey

    const bulletins = await Admin.listNotificationBulletins({ userIds, bulletinKey })
    if (bulletins instanceof Error) throw mapError(bulletins)

    return bulletins
  },
})

export default NotificationBulletinsQuery
