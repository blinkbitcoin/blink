import { DomainError, ErrorLevel } from "@/domain/shared"

export class ApiKeyLimitExceededError extends DomainError {
  level = ErrorLevel.Critical
}

export class ApiKeyInvalidLimitError extends DomainError {
  level = ErrorLevel.Critical
}

export class ApiKeySpendingRecordError extends DomainError {
  level = ErrorLevel.Critical
}

export class InvalidApiKeyIdError extends DomainError {
  level = ErrorLevel.Warn
}

export class UnknownApiKeysServiceError extends DomainError {
  level = ErrorLevel.Critical
}
