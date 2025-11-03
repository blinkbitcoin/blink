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

// Service-level errors
export class InvalidApiKeyIdError extends DomainError {
  level = ErrorLevel.Warn
}

export class ApiKeysServiceUnreachableError extends DomainError {
  level = ErrorLevel.Critical
}

export class UnknownApiKeysServiceError extends DomainError {
  level = ErrorLevel.Critical
}
