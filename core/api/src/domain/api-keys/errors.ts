import { DomainError, ErrorLevel } from "@/domain/shared"

export class ApiKeysServiceError extends DomainError {}

export class ApiKeyLimitExceededError extends ApiKeysServiceError {
  level = ErrorLevel.Info
}

export class ApiKeyInvalidLimitError extends ApiKeysServiceError {}

export class ApiKeySpendingRecordError extends ApiKeysServiceError {
  level = ErrorLevel.Critical
}

export class InvalidApiKeyIdError extends ApiKeysServiceError {
  level = ErrorLevel.Warn
}

export class UnknownApiKeysServiceError extends ApiKeysServiceError {
  level = ErrorLevel.Critical
}
