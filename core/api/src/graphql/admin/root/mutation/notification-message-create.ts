import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"
import { NotificationsService } from "@/services/notifications"

const NotificationMessageCreateInput = GT.Input({
  name: "NotificationMessageCreateInput",
  fields: () => ({
    username: { type: GT.NonNull(GT.String) },
    status: { type: NotificationStatus },
    sentBy: { type: GT.NonNull(GT.String) },
    templateId: { type: GT.NonNullID },
  }),
})

const NotificationMessageCreateMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      username: string
      status?: MsgMessageStatus
      sentBy: string
      templateId: string | Error
    }
  }
>({
  extensions: {
    complexity: 40,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: {
      type: GT.NonNull(NotificationMessageCreateInput),
    },
  },
  resolve: async (_, args) => {
    const { username, status, sentBy, templateId } = args.input

    if (templateId instanceof Error) {
      return { errors: [{ message: templateId.message }], success: false }
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgMessageCreate({
      username,
      status,
      sentBy,
      templateId,
    })
    if (res instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(res)], success: false }
    }

    return {
      errors: [],
      success: true,
    }
  },
})

export default NotificationMessageCreateMutation
