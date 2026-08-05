export const MigrationFlowPhase = {
  NotStarted: "NOT_STARTED",
  InProgress: "IN_PROGRESS",
  Transferring: "TRANSFERRING",
  Completed: "COMPLETED",
  Failed: "FAILED",
} as const

export const MigrationLnAddressTransferStatus = {
  Transferred: "TRANSFERRED",
  AlreadyTransferred: "ALREADY_TRANSFERRED",
  SkippedNotRegistered: "SKIPPED_NOT_REGISTERED",
  Failed: "FAILED",
} as const
