import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"

const AccountForceDeletePayload = GT.Object({
  name: "AccountForceDeletePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    success: {
      type: GT.NonNull(GT.Boolean),
    },
  }),
})

export default AccountForceDeletePayload
