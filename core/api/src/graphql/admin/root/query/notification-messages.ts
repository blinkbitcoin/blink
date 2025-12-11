import { GT } from "@/graphql/index"
import NotificationMessage from "@/graphql/admin/types/object/notification-message"
import { NotificationsService } from "@/services/notifications"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const NotificationMessagesQuery = GT.Field<
  null,
  GraphQLAdminContext,
  {
    limit?: number | Error
    offset?: number | Error
  }
>({
  type: GT.NonNullList(NotificationMessage),
  args: {
    limit: { type: GT.Int },
    offset: { type: GT.Int },
  },
  resolve: async (_, args) => {
    const notificationsService = NotificationsService()

    if (args.limit instanceof Error) {
      throw mapAndParseErrorForGqlResponse(args.limit)
    }

    if (args.offset instanceof Error) {
      throw mapAndParseErrorForGqlResponse(args.offset)
    }

    const res = await notificationsService.msgMessagesList({
      limit: args.limit,
      offset: args.offset,
    })

    if (res instanceof Error) {
      throw mapAndParseErrorForGqlResponse(res)
    }

    return res
  },
})

export default NotificationMessagesQuery
