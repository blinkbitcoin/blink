import { Admin } from "@/app"

import { GT } from "@/graphql/index"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"
import BulletinKey from "@/graphql/admin/types/scalar/bulletin-key"
import SuccessPayload from "@/graphql/shared/types/payload/success-payload"

const NotificationBulletinCloseInput = GT.Input({
  name: "NotificationBulletinCloseInput",
  fields: () => ({
    userId: {
      type: GT.NonNullID,
    },
    bulletinKey: {
      type: GT.NonNull(BulletinKey),
    },
  }),
})

const NotificationBulletinCloseMutation = GT.Field<
  null,
  GraphQLAdminContext,
  {
    input: {
      userId: string
      bulletinKey: BulletinKey | Error
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(SuccessPayload),
  description:
    "Closes the active bulletin with the given key for the user. Bulletins with that key sent before this call are not shown afterwards",
  args: {
    input: { type: GT.NonNull(NotificationBulletinCloseInput) },
  },
  resolve: async (_, args) => {
    const { userId, bulletinKey } = args.input

    if (bulletinKey instanceof Error) {
      return { errors: [{ message: bulletinKey.message }], success: false }
    }

    const result = await Admin.closeNotificationBulletin({ userId, bulletinKey })

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)], success: false }
    }

    return { errors: [], success: result }
  },
})

export default NotificationBulletinCloseMutation
