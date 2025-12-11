import { GT } from "@/graphql/index"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { NotificationsService } from "@/services/notifications"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const NotificationTemplateDeleteInput = GT.Input({
  name: "NotificationTemplateDeleteInput",
  fields: () => ({
    id: { type: GT.NonNullID },
  }),
})

const NotificationTemplateDeleteMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      id: string | Error
    }
  }
>({
  extensions: {
    complexity: 30,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(NotificationTemplateDeleteInput) },
  },
  resolve: async (_, args) => {
    const { id } = args.input

    if (id instanceof Error) {
      return { errors: [{ message: id.message }], success: false }
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgTemplateDelete({ id })

    if (res instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(res)], success: false }
    }

    return {
      errors: [],
      success: true,
    }
  },
})

export default NotificationTemplateDeleteMutation
