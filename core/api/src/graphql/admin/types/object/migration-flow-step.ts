import { GT } from "@/graphql/index"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

// step details are written for operators, not for this surface: several carry the
// drained amount or the bank-owner subsidy. Only these are cleared for the admin API —
// a step added later stays redacted until it is added here on purpose.
const DETAIL_VISIBLE_STEPS: string[] = [
  "commit",
  "transfer-pending",
  "transfer-failed",
  "transfer-settled",
  "retry-granted",
]

export const visibleStepDetail = (step: MigrationFlowStep): string | null =>
  DETAIL_VISIBLE_STEPS.includes(step.step) ? (step.detail ?? null) : null

const MigrationFlowStep = GT.Object<MigrationFlowStep>({
  name: "MigrationFlowStep",
  fields: () => ({
    step: {
      type: GT.NonNull(GT.String),
    },
    recordedAt: {
      type: GT.NonNull(Timestamp),
    },
    detail: {
      type: GT.String,
      resolve: (source) => visibleStepDetail(source),
    },
  }),
})

export default MigrationFlowStep
