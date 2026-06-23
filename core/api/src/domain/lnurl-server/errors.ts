import { DomainError, ErrorLevel } from "@/domain/shared"

export class LnurlServerServiceError extends DomainError {}

export class LnurlServerBadRequestError extends LnurlServerServiceError {
  level = ErrorLevel.Critical
}

export class LnurlServerUnauthorizedError extends LnurlServerServiceError {
  level = ErrorLevel.Critical
}

export class LnurlServerForbiddenError extends LnurlServerServiceError {
  level = ErrorLevel.Critical
}

export class LnurlServerNotFoundError extends LnurlServerServiceError {}

export class LnurlServerUnavailableError extends LnurlServerServiceError {
  level = ErrorLevel.Critical
}

export class LnurlServerConflictError extends LnurlServerServiceError {}

export class LnurlServerIdentifierConflictError extends LnurlServerConflictError {}

export class LnurlServerBlinkAccountExistsError extends LnurlServerConflictError {}

export class LnurlServerMissingInternalUrlError extends LnurlServerServiceError {}

export class UnknownLnurlServerServiceError extends LnurlServerServiceError {
  level = ErrorLevel.Critical
}
