import {
  checkedMigrationFlowPhaseTransition,
  checkedToMigrationFlowPhase,
  InvalidMigrationFlowPhaseError,
  MigrationFlowPhase,
  MigrationStateConflictError,
} from "@/domain/migration-flow"

describe("checkedToMigrationFlowPhase", () => {
  it("accepts every defined phase", () => {
    for (const phase of Object.values(MigrationFlowPhase)) {
      expect(checkedToMigrationFlowPhase(phase)).toBe(phase)
    }
  })

  it("rejects an unknown phase", () => {
    expect(checkedToMigrationFlowPhase("SOMETHING_ELSE")).toBeInstanceOf(
      InvalidMigrationFlowPhaseError,
    )
  })

  it("rejects an empty phase", () => {
    expect(checkedToMigrationFlowPhase("")).toBeInstanceOf(InvalidMigrationFlowPhaseError)
  })

  it("rejects a phase with different casing", () => {
    expect(checkedToMigrationFlowPhase("in_progress")).toBeInstanceOf(
      InvalidMigrationFlowPhaseError,
    )
  })
})

describe("checkedMigrationFlowPhaseTransition", () => {
  const validTransitions: [MigrationFlowPhase, MigrationFlowPhase][] = [
    [MigrationFlowPhase.NotStarted, MigrationFlowPhase.InProgress],
    [MigrationFlowPhase.InProgress, MigrationFlowPhase.Transferring],
    [MigrationFlowPhase.Transferring, MigrationFlowPhase.Completed],
    [MigrationFlowPhase.Transferring, MigrationFlowPhase.Failed],
    [MigrationFlowPhase.Failed, MigrationFlowPhase.Completed],
  ]

  test.each(validTransitions)("allows %s -> %s", (from, to) => {
    expect(checkedMigrationFlowPhaseTransition({ from, to })).toBe(to)
  })

  const allPhases = Object.values(MigrationFlowPhase)
  const invalidTransitions = allPhases
    .flatMap((from) => allPhases.map((to) => [from, to] as const))
    .filter(([from, to]) => !validTransitions.some(([f, t]) => f === from && t === to))

  test.each(invalidTransitions)("rejects %s -> %s", (from, to) => {
    expect(checkedMigrationFlowPhaseTransition({ from, to })).toBeInstanceOf(
      MigrationStateConflictError,
    )
  })

  it("covers the full transition matrix", () => {
    expect(invalidTransitions.length).toBe(
      allPhases.length * allPhases.length - validTransitions.length,
    )
  })
})
