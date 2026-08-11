import MigrationFlowStep from "./migration-flow-step"

import { GT } from "@/graphql/index"
import MigrationStatus from "@/graphql/public/types/scalar/migration-status"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

// deliberately carries no amounts: the retry decision never needs the drained balance
// or the bank-owner top-up, so they are not exposed here
const MigrationFlowDetails = GT.Object<MigrationFlow>({
  name: "MigrationFlowDetails",
  fields: () => ({
    accountId: {
      type: GT.NonNullID,
    },
    status: {
      type: GT.NonNull(MigrationStatus),
      resolve: (source) => source.phase,
    },
    lnPaymentHash: {
      type: GT.String,
      resolve: (source) => source.lnPaymentHash ?? null,
    },
    destinationSparkPubkey: {
      type: GT.String,
      resolve: (source) => source.destinationSparkPubkey ?? null,
    },
    destinationProofVerified: {
      type: GT.NonNull(GT.Boolean),
    },
    createdAt: {
      type: GT.NonNull(Timestamp),
    },
    updatedAt: {
      type: GT.NonNull(Timestamp),
    },
    steps: {
      type: GT.NonNullList(MigrationFlowStep),
    },
  }),
})

export default MigrationFlowDetails
