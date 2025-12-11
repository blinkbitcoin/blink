import { GT } from "@/graphql/index"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { NotificationsService } from "@/services/notifications"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const NotificationMessageCreateInput = GT.Input({
  name: "NotificationMessageCreateInput",
  fields: () => ({
    username: { type: GT.NonNull(GT.String) },
    status: { type: GT.String },
    sentBy: { type: GT.NonNull(GT.String) },
  }),
})

const NotificationMessageCreateMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      username: string
      status?: string
      sentBy: string
    }
  }
>({
  extensions: {
    complexity: 40,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(NotificationMessageCreateInput) },
  },
  resolve: async (_, args) => {
    const { username, status, sentBy } = args.input
    const notificationsService = NotificationsService()

    const res = await notificationsService.msgMessageCreate({
      username,
      status,
      sentBy,
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
