import { GT } from "@/graphql/index"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

// step details are written for operators, not for this surface: several carry the
// drained amount, the bank-owner subsidy, or the residual balance. Only these are
// cleared — a step added later stays redacted until it is added here on purpose, and
// anything added here must be checked against the string the app layer actually writes.
const DETAIL_VISIBLE_STEPS: string[] = [
  "commit",
  "transfer-pending",
  "transfer-failed",
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
