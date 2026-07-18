import { DomainError } from "@/domain/shared"

export class MigrationFlowError extends DomainError {}

export class MigrationStateConflictError extends MigrationFlowError {}
export class MigrationFlowDisabledError extends MigrationFlowError {}
export class MigrationApiKeyForbiddenError extends MigrationFlowError {}
export class MigrationNotEligibleError extends MigrationFlowError {}
export class MigrationDollarBalanceNotEmptyError extends MigrationFlowError {}
export class MigrationInvalidDestinationError extends MigrationFlowError {}
export class MigrationProofExpiredError extends MigrationInvalidDestinationError {}
export class InvalidMigrationFlowPhaseError extends MigrationFlowError {}
