import { GT } from "@/graphql/index"
import Timestamp from "@/graphql/shared/types/scalar/timestamp"

const DETAIL_VISIBLE_STEPS: string[] = [
  "commit",
  "transfer-pending",
  "transfer-failed",
  "retry-granted",
]

const QUOTES_AN_AMOUNT = /\d[\d,_ ]*\s*sats?\b/i

export const visibleStepDetail = (step: MigrationFlowStep): string | null => {
  if (!DETAIL_VISIBLE_STEPS.includes(step.step)) return null

  const detail = step.detail ?? null
  if (detail !== null && QUOTES_AN_AMOUNT.test(detail)) return null

  return detail
}

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
