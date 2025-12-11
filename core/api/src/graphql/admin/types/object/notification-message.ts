import { GT } from "@/graphql/index"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

const NotificationMessage = GT.Object<{
  id: string
  username: string
  status: string
  sentBy: string
  updatedAt: number
}>({
  name: "NotificationMessage",
  fields: () => ({
    id: {
      type: GT.NonNullID,
    },
    username: {
      type: GT.NonNull(GT.String),
    },
    status: {
      type: GT.NonNull(GT.String),
    },
    sentBy: {
      type: GT.NonNull(GT.String),
    },
    updatedAt: {
      type: GT.NonNull(Timestamp),
    },
  }),
})

export default NotificationMessage
