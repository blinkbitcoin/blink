import { DomainError, ErrorLevel } from "@/domain/shared"

export class AppCheckServiceError extends DomainError {}

export class UnknownAppCheckError extends AppCheckServiceError {
  level = ErrorLevel.Critical
}

export class MissingAppCheckTokenError extends AppCheckServiceError {
  level = ErrorLevel.Warn
}
export class UnauthorizedAppCheckTokenError extends AppCheckServiceError {
  level = ErrorLevel.Warn
}
