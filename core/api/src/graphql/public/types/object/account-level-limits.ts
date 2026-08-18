import { GT } from "@/graphql/index"

import AccountLevel from "@/graphql/shared/types/scalar/account-level"
import CentAmount from "@/graphql/public/types/scalar/cent-amount"
import Seconds from "@/graphql/public/types/scalar/seconds"

const AccountLevelLimits = GT.Object({
  name: "AccountLevelLimits",
  description: `Daily transaction limits enforced for a given account level.`,
  fields: () => ({
    level: {
      type: GT.NonNull(AccountLevel),
    },
    interval: {
      type: GT.NonNull(Seconds),
      description: `The rolling time interval in seconds that the limits apply for.`,
    },
    withdrawal: {
      type: GT.NonNull(CentAmount),
      description: `Max amount that can be withdrawn to external onchain or lightning destinations.`,
    },
    internalSend: {
      type: GT.NonNull(CentAmount),
      description: `Max amount that can be sent to other internal accounts.`,
    },
    convert: {
      type: GT.NonNull(CentAmount),
      description: `Max amount that can be converted between currencies among an account's own wallets.`,
    },
  }),
})

export default AccountLevelLimits
