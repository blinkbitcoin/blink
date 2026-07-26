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

const FeesInformation = GT.Object({
  name: "FeesInformation",
  fields: () => ({
    deposit: { type: GT.NonNull(DepositFeesInformation) },
  }),
})

export default FeesInformation
