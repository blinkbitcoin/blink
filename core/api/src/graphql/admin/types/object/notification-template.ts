import { GT } from "@/graphql/index"
import Language from "@/graphql/shared/types/scalar/language"

const NotificationTemplate = GT.Object<{
  id: string
  name: string
  languageCode: string
  iconName: string
  title: string
  body: string
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
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
  }),
})

export default NotificationTemplate
