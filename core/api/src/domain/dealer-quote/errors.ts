import { DomainError, ErrorLevel } from "@/domain/shared"

export class DealerQuoteError extends DomainError {}

export class DealerQuoteArgumentError extends DealerQuoteError {}

export class DealerQuoteServiceError extends DealerQuoteError {}
export class DealerQuoteNotAvailableError extends DealerQuoteServiceError {}
export class NoConnectionToDealerError extends DealerQuoteServiceError {
  level = ErrorLevel.Critical
}
export class DealerQuotesAppError extends DealerQuoteServiceError {
  level = ErrorLevel.Critical
}
export class DealerQuotesServerError extends DealerQuoteServiceError {
  level = ErrorLevel.Critical
}
export class UnknownDealerQuoteServiceError extends DealerQuoteServiceError {
  level = ErrorLevel.Critical
}
