import WindDownStatus from "../scalar/wind-down-status"

import Timestamp from "@/graphql/shared/types/scalar/timestamp"
import { GT } from "@/graphql/index"

const AccountWindDown = GT.Object<AccountWindDown, GraphQLPublicContextAuth>({
  name: "AccountWindDown",
  fields: () => ({
    status: {
      type: GT.NonNull(WindDownStatus),
    },
    receiveDisabledAt: {
      type: GT.NonNull(Timestamp),
    },
    finalDeadline: {
      type: GT.NonNull(Timestamp),
    },
    gateArmsAt: {
      type: GT.NonNull(Timestamp),
    },
    timezone: {
      type: GT.NonNull(GT.String),
    },
  }),
})

export default AccountWindDown
