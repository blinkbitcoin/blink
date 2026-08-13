import { DomainError, ErrorLevel } from "@/domain/shared"

export class IpFetcherError extends DomainError {}

export class IpFetcherServiceError extends IpFetcherError {}
export class UnknownIpFetcherServiceError extends IpFetcherError {
  level = ErrorLevel.Critical
}
export class IpFetcherBudgetExceededError extends IpFetcherServiceError {
  level = ErrorLevel.Warn
}
export class UnresolvedIpFetcherServiceError extends IpFetcherServiceError {
  level = ErrorLevel.Warn
}
