import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"
import { NotificationsService } from "@/services/notifications"

const NotificationMessageHistoryItem = GT.Object({
  name: "NotificationMessageHistoryItem",
  fields: () => ({
    id: { type: GT.NonNullID },
    status: { type: GT.NonNull(NotificationStatus) },
    createdAt: { type: GT.NonNull(GT.Int) },
  }),
})

const NotificationMessageHistoryQuery = GT.Field<
  null,
  GraphQLAdminContext,
  {
    id: string | Error
  }
>({
  type: GT.NonNullList(NotificationMessageHistoryItem),
  args: {
    id: { type: GT.NonNullID },
  },
  resolve: async (_, args) => {
    const { id } = args

    if (id instanceof Error) {
      throw mapAndParseErrorForGqlResponse(id)
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgMessageHistoryList({ id })

    if (res instanceof Error) {
      throw mapAndParseErrorForGqlResponse(res)
    }

    return res
  },
})

export default NotificationMessageHistoryQuery
