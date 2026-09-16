import CentAmount from "../scalar/cent-amount"

import Timestamp from "@/graphql/shared/types/scalar/timestamp"
import { GT } from "@/graphql/index"

const DepositFeeTier = GT.Object({
  name: "DepositFeeTier",
  fields: () => ({
    maxAmount: {
      description: "highest amount this tier applies to, null when unbounded",
      type: GT.String,
    },
    amount: { type: GT.NonNull(GT.String) },
  }),
})

const DepositFeesInformation = GT.Object({
  name: "DepositFeesInformation",
  fields: () => ({
    minBankFee: { type: GT.NonNull(GT.String) },
    minBankFeeThreshold: {
      description: "below this amount minBankFee will be charged",
      type: GT.NonNull(GT.String),
    },
    tiers: {
      description: "amount charged per tier, in ascending order of maxAmount",
      type: GT.NonNullList(DepositFeeTier),
    },
    ratio: {
      description: "ratio to charge as basis points above minBankFeeThreshold amount",
      type: GT.NonNull(GT.String),
      deprecationReason: "fees are a flat amount per tier, use tiers",
    },
  }),
})

const InactivityFeeInformation = GT.Object({
  name: "InactivityFeeInformation",
  fields: () => ({
    usdCentsPerMonth: {
      description:
        "monthly fee per balance for an account with no activity for 12 months, in USD cents",
      type: GT.NonNull(CentAmount),
    },
    effectiveFrom: {
      description: "first date the inactivity fee applies",
      type: GT.NonNull(Timestamp),
    },
  }),
})

const FeesInformation = GT.Object({
  name: "FeesInformation",
  fields: () => ({
    deposit: { type: GT.NonNull(DepositFeesInformation) },
    inactivityFee: { type: GT.NonNull(InactivityFeeInformation) },
  }),
})

export default FeesInformation
