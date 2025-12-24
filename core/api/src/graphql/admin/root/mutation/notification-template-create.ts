import { GT } from "@/graphql/index"
import Language from "@/graphql/shared/types/scalar/language"
import ExternalUrl from "@/graphql/admin/types/scalar/external-url"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import DeepLinkActionTemplate from "@/graphql/admin/types/scalar/deep-link-action-template"
import DeepLinkScreenTemplate from "@/graphql/admin/types/scalar/deep-link-screen-template"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"
import { NotificationsService } from "@/services/notifications"

const NotificationTemplateCreateInput = GT.Input({
  name: "NotificationTemplateCreateInput",
  fields: () => ({
    name: { type: GT.NonNull(GT.String) },
    languageCode: { type: GT.NonNull(Language) },
    iconName: { type: GT.NonNull(GT.String) },
    title: { type: GT.NonNull(GT.String) },
    body: { type: GT.NonNull(GT.String) },
    status: { type: NotificationStatus },
    shouldSendPush: { type: GT.NonNull(GT.Boolean) },
    shouldAddToHistory: { type: GT.NonNull(GT.Boolean) },
    shouldAddToBulletin: { type: GT.NonNull(GT.Boolean) },
    deeplinkAction: { type: DeepLinkActionTemplate },
    deeplinkScreen: { type: DeepLinkScreenTemplate },
    externalUrl: { type: ExternalUrl },
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
      status: MsgMessageStatus
      deeplinkAction?: string
      deeplinkScreen?: string
      externalUrl?: string
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
      status,
      shouldSendPush,
      shouldAddToHistory,
      shouldAddToBulletin,
      deeplinkAction,
      deeplinkScreen,
      externalUrl,
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
      status,
      shouldSendPush,
      shouldAddToHistory,
      shouldAddToBulletin,
      deeplinkAction,
      deeplinkScreen,
      externalUrl,
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
