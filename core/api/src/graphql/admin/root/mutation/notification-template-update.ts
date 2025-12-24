import { GT } from "@/graphql/index"
import Language from "@/graphql/shared/types/scalar/language"
import ExternalUrl from "@/graphql/admin/types/scalar/external-url"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"
import DeepLinkActionTemplate from "@/graphql/admin/types/scalar/deep-link-action-template"
import DeepLinkScreenTemplate from "@/graphql/admin/types/scalar/deep-link-screen-template"
import { NotificationsService } from "@/services/notifications"

const NotificationTemplateUpdateInput = GT.Input({
  name: "NotificationTemplateUpdateInput",
  fields: () => ({
    id: { type: GT.NonNullID },
    name: { type: GT.NonNull(GT.String) },
    languageCode: { type: GT.NonNull(Language) },
    iconName: { type: GT.NonNull(GT.String) },
    title: { type: GT.NonNull(GT.String) },
    body: { type: GT.NonNull(GT.String) },
    shouldSendPush: { type: GT.NonNull(GT.Boolean) },
    shouldAddToHistory: { type: GT.NonNull(GT.Boolean) },
    shouldAddToBulletin: { type: GT.NonNull(GT.Boolean) },
    status: { type: NotificationStatus },
    deeplinkAction: { type: DeepLinkActionTemplate },
    deeplinkScreen: { type: DeepLinkScreenTemplate },
    externalUrl: { type: ExternalUrl },
  }),
})

const NotificationTemplateUpdateMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      id: string | Error
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
    input: { type: GT.NonNull(NotificationTemplateUpdateInput) },
  },
  resolve: async (_, args) => {
    const {
      id,
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

    if (id instanceof Error) {
      return { errors: [{ message: id.message }], success: false }
    }

    if (languageCode instanceof Error) {
      return { errors: [{ message: languageCode.message }], success: false }
    }

    const notificationsService = NotificationsService()

    const res = await notificationsService.msgTemplateUpdate({
      id,
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

export default NotificationTemplateUpdateMutation
