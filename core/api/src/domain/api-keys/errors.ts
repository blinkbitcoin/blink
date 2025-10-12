import { DomainError, ErrorLevel } from "@/domain/shared"

export class ApiKeyDailyLimitExceededError extends DomainError {
  level = ErrorLevel.Warn

  constructor(public readonly remainingSats: number | null) {
    super(
      remainingSats !== null
        ? `API key daily spending limit exceeded. Remaining: ${remainingSats} sats`
        : "API key daily spending limit exceeded",
    )
    this.name = "ApiKeyDailyLimitExceededError"
  }
}

export class ApiKeyLimitCheckError extends DomainError {
  level = ErrorLevel.Warn

  constructor(message?: string) {
    super(message || "Failed to check API key spending limit")
    this.name = "ApiKeyLimitCheckError"
  }
}

export class ApiKeySpendingRecordError extends DomainError {
  level = ErrorLevel.Info // Lower severity - this doesn't block the payment

  constructor(message?: string) {
    super(message || "Failed to record API key spending")
    this.name = "ApiKeySpendingRecordError"
  }
}
