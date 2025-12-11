import { GT } from "@/graphql/index"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { NotificationsService } from "@/services/notifications"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const NotificationMessageUpdateStatusInput = GT.Input({
  name: "NotificationMessageUpdateStatusInput",
  fields: () => ({
    id: { type: GT.NonNullID },
    status: { type: GT.NonNull(GT.String) },
  }),
})

const NotificationMessageUpdateStatusMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      id: string | Error
      status: string
    }
  }
>({
  extensions: {
    complexity: 30,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(NotificationMessageUpdateStatusInput) },
  },
  resolve: async (_, args) => {
    const { id, status } = args.input

    if (id instanceof Error) {
      return { errors: [{ message: id.message }], success: false }
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgMessageUpdateStatus({
      id,
      status,
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

export default NotificationMessageUpdateStatusMutation
