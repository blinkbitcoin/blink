import { GT } from "@/graphql/index"
import Language from "@/graphql/shared/types/scalar/language"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import { NotificationsService } from "@/services/notifications"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const NotificationTemplateCreateInput = GT.Input({
  name: "NotificationTemplateCreateInput",
  fields: () => ({
    name: { type: GT.NonNull(GT.String) },
    languageCode: { type: GT.NonNull(Language) },
    iconName: { type: GT.NonNull(GT.String) },
    title: { type: GT.NonNull(GT.String) },
    body: { type: GT.NonNull(GT.String) },
    shouldSendPush: { type: GT.NonNull(GT.Boolean) },
    shouldAddToHistory: { type: GT.NonNull(GT.Boolean) },
    shouldAddToBulletin: { type: GT.NonNull(GT.Boolean) },
  }),
})

const NotificationTemplateCreateMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      name: string
      languageCode: string | Error
      iconName: string
      title: string
      body: string
      shouldSendPush: boolean
      shouldAddToHistory: boolean
      shouldAddToBulletin: boolean
    }
  }
>({
  extensions: {
    complexity: 60,
  },
  type: GT.NonNull(SuccessPayload),
  args: {
    input: { type: GT.NonNull(NotificationTemplateCreateInput) },
  },
  resolve: async (_, args) => {
    const {
      name,
      languageCode,
      iconName,
      title,
      body,
      shouldSendPush,
      shouldAddToHistory,
      shouldAddToBulletin,
    } = args.input

    if (languageCode instanceof Error) {
      return { errors: [{ message: languageCode.message }], success: false }
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgTemplateCreate({
      name,
      languageCode,
      iconName,
      title,
      body,
      shouldSendPush,
      shouldAddToHistory,
      shouldAddToBulletin,
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

export default NotificationTemplateCreateMutation
