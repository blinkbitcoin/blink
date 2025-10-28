import { DomainError, ErrorLevel } from "@/domain/shared"

export class ApiKeyLimitExceededError extends DomainError {
  level = ErrorLevel.Warn
}

export class ApiKeyLimitCheckError extends DomainError {
  level = ErrorLevel.Critical
}

export class ApiKeySpendingRecordError extends DomainError {
  level = ErrorLevel.Critical
}
