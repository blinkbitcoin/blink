import { MigrationStateConflictError, InvalidMigrationFlowPhaseError } from "./errors"

import { MigrationFlowPhase } from "./primitives"

export * from "./errors"
export * from "./primitives"
export * from "./proof-of-possession"

const MigrationFlowPhaseTransitions: Record<
  MigrationFlowPhase,
  readonly MigrationFlowPhase[]
> = {
  [MigrationFlowPhase.NotStarted]: [MigrationFlowPhase.InProgress],
  [MigrationFlowPhase.InProgress]: [MigrationFlowPhase.Transferring],
  [MigrationFlowPhase.Transferring]: [
    MigrationFlowPhase.Completed,
    MigrationFlowPhase.Failed,
  ],
  [MigrationFlowPhase.Completed]: [],
  [MigrationFlowPhase.Failed]: [MigrationFlowPhase.Completed],
}

export const checkedToMigrationFlowPhase = (
  phase: string,
): MigrationFlowPhase | InvalidMigrationFlowPhaseError => {
  const checkedPhase = Object.values(MigrationFlowPhase).find((p) => p === phase)
  if (!checkedPhase) return new InvalidMigrationFlowPhaseError(phase)
  return checkedPhase
}

export const checkedMigrationFlowPhaseTransition = ({
  from,
  to,
}: {
  from: MigrationFlowPhase
  to: MigrationFlowPhase
}): MigrationFlowPhase | MigrationStateConflictError =>
  MigrationFlowPhaseTransitions[from]?.includes(to)
    ? to
    : new MigrationStateConflictError(`invalid phase transition: ${from} -> ${to}`)
