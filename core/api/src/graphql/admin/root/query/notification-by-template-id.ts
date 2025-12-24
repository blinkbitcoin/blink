import { GT } from "@/graphql/index"
import NotificationTemplate from "@/graphql/admin/types/object/notification-template"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import { NotificationsService } from "@/services/notifications"

const NotificationByTemplateIdQuery = GT.Field<
  null,
  GraphQLAdminContext,
  {
    id: string | Error
  }
>({
  type: NotificationTemplate,
  args: {
    id: { type: GT.NonNull(GT.ID) },
  },
  resolve: async (_, args) => {
    const notificationsService = NotificationsService()

    if (args.id instanceof Error) {
      throw mapAndParseErrorForGqlResponse(args.id)
    }

    const res = await notificationsService.msgTemplateById({ id: args.id })

    if (res instanceof Error) {
      throw mapAndParseErrorForGqlResponse(res)
    }

    if (!res) {
      throw new Error("Notification template not found")
    }

    return res
  },
})

export default NotificationByTemplateIdQuery
