import { DomainError, ErrorLevel } from "@/domain/shared"

export class ESignError extends DomainError {}

export class ESignServiceError extends ESignError {}
export class ESignNotConfiguredError extends ESignServiceError {}
export class ESignEnvelopeNotFoundError extends ESignServiceError {}
export class ESignRecipientStatusNotSupportedError extends ESignServiceError {}
export class ESignProviderUnavailableError extends ESignServiceError {
  level = ErrorLevel.Warn
}
export class ESignEnvelopeCreationError extends ESignServiceError {
  level = ErrorLevel.Critical
}
export class UnknownESignServiceError extends ESignServiceError {
  level = ErrorLevel.Critical
}
