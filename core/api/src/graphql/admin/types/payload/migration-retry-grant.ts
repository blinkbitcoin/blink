import { GT } from "@/graphql/index"
import IError from "@/graphql/shared/types/abstract/error"

const MigrationRetryGrantPayload = GT.Object({
  name: "MigrationRetryGrantPayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    success: {
      type: GT.NonNull(GT.Boolean),
    },
  }),
})

export default MigrationRetryGrantPayload
