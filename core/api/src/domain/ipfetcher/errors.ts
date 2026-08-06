import { DomainError, ErrorLevel } from "@/domain/shared"

export class IpFetcherError extends DomainError {}

export class IpFetcherServiceError extends IpFetcherError {}
export class UnknownIpFetcherServiceError extends IpFetcherError {
  level = ErrorLevel.Critical
}
export class IpFetcherBudgetExceededError extends IpFetcherError {
  level = ErrorLevel.Warn
}
// the vendor answered but resolved nothing — never a verdict, never cacheable
export class UnresolvedIpFetcherServiceError extends IpFetcherError {
  level = ErrorLevel.Critical
}
