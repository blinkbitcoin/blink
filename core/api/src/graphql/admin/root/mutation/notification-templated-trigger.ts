import { GT } from "@/graphql/index"
import { Admin } from "@/app"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"

const NotificationTemplatedTriggerInput = GT.Input({
  name: "NotificationTemplatedTriggerInput",
  fields: () => ({
    handle: {
      type: GT.NonNull(GT.String),
    },
    status: {
      type: GT.NonNull(NotificationStatus),
    },
    language: {
      type: GT.String,
    },
  }),
})

const TriggerNotificationTemplatedMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      handle: string | Error
      status: string | Error
      language?: string | Error
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(NotificationTemplatedTriggerInput) },
  },
  resolve: async (_, args) => {
    const { handle, status, language } = args.input

    if (handle instanceof Error) {
      return { errors: [{ message: handle.message }], success: false }
    }

    if (status instanceof Error) {
      return { errors: [{ message: status.message }], success: false }
    }

    if (language instanceof Error) {
      return { errors: [{ message: language.message }], success: false }
    }

    const res = await Admin.triggerNotificationTemplated({
      handle,
      status,
      language,
    })
    if (res instanceof Error) {
      const mapped = mapAndParseErrorForGqlResponse(res)
      return { errors: [mapped], success: false }
    }

    return {
      errors: [],
      success: res,
    }
  },
})

export default TriggerNotificationTemplatedMutation
