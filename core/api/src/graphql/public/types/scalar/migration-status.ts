import { MigrationFlowPhase } from "@/domain/migration-flow"
import { GT } from "@/graphql/index"

const MigrationStatus = GT.Enum({
  name: "MigrationStatus",
  values: {
    NOT_STARTED: { value: MigrationFlowPhase.NotStarted },
    IN_PROGRESS: { value: MigrationFlowPhase.InProgress },
    TRANSFERRING: { value: MigrationFlowPhase.Transferring },
    COMPLETED: { value: MigrationFlowPhase.Completed },
    FAILED: { value: MigrationFlowPhase.Failed },
  },
})

export default MigrationStatus
