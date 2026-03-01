import { DomainError, ErrorLevel } from "@/domain/shared"

export class QuotesError extends DomainError {}

export class QuotesServiceError extends QuotesError {}
export class QuotesNotAvailableError extends QuotesServiceError {}
export class NoConnectionToQuotesError extends QuotesServiceError {
  level = ErrorLevel.Critical
}

export class QuotesAlreadyAcceptedError extends QuotesServiceError {}
export class QuotesExpiredError extends QuotesServiceError {}
export class QuotesCouldNotParseIdError extends QuotesServiceError {}

export class QuotesExchangePriceError extends QuotesServiceError {
  level = ErrorLevel.Critical
}

export class QuotesEntityError extends QuotesServiceError {
  level = ErrorLevel.Critical
}

export class QuotesLedgerError extends QuotesServiceError {
  level = ErrorLevel.Critical
}

export class QuotesServerError extends QuotesServiceError {
  level = ErrorLevel.Critical
}
export class UnknownQuotesServiceError extends QuotesServiceError {
  level = ErrorLevel.Critical
}
