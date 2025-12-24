import { GT } from "@/graphql/index"
import Language from "@/graphql/shared/types/scalar/language"
import NotificationStatus from "@/graphql/admin/types/scalar/notification-status"

const NotificationTemplate = GT.Object<{
  id: string
  name: string
  languageCode: string
  iconName: string
  title: string
  body: string
  status: MsgMessageStatus
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
  deeplinkAction?: string
  deeplinkScreen?: string
  externalUrl?: string
}>({
  name: "NotificationTemplate",
  fields: () => ({
    id: {
      type: GT.NonNullID,
    },
    name: {
      type: GT.NonNull(GT.String),
    },
    languageCode: {
      type: GT.NonNull(Language),
    },
    iconName: {
      type: GT.NonNull(GT.String),
    },
    title: {
      type: GT.NonNull(GT.String),
    },
    body: {
      type: GT.NonNull(GT.String),
    },
    shouldSendPush: {
      type: GT.NonNull(GT.Boolean),
    },
    shouldAddToHistory: {
      type: GT.NonNull(GT.Boolean),
    },
    shouldAddToBulletin: {
      type: GT.NonNull(GT.Boolean),
    },
    deeplinkAction: {
      type: GT.String,
    },
    deeplinkScreen: {
      type: GT.String,
    },
    externalUrl: {
      type: GT.String,
    },
    status: {
      type: GT.NonNull(NotificationStatus),
    },
  }),
})

export default NotificationTemplate
