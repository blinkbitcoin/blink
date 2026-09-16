import { DomainError, ErrorLevel, ValidationError } from "@/domain/shared"

export class InvestmentAgreementError extends DomainError {}

export class InvestmentAgreementStateConflictError extends InvestmentAgreementError {}
export class InvestmentAgreementInProgressError extends InvestmentAgreementError {}
export class InvestmentAgreementDisabledError extends InvestmentAgreementError {}
export class InvestmentAgreementApiKeyForbiddenError extends InvestmentAgreementError {}
export class InvestmentAgreementEmailRequiredError extends InvestmentAgreementError {}

export class InvestmentAgreementTabConflictError extends InvestmentAgreementError {
  level = ErrorLevel.Critical
}

export class InvalidInvestmentUnitsError extends ValidationError {}
export class InvalidInvestmentAgreementTemplateIdsError extends ValidationError {}
export class InvalidInvestmentAgreementTimeZoneError extends ValidationError {}
export class InvalidInvestmentAgreementBtcPriceError extends ValidationError {
  level = ErrorLevel.Warn
}
