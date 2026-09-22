import { DomainError, ErrorLevel, ValidationError } from "@/domain/shared"

export class InactivityFeeError extends DomainError {}

// an account has no active notice row; ordinary for most accounts
export class InactivityFeeNoticeNotFoundError extends InactivityFeeError {}

// the bulletin went out but the row could not be flagged: the user was warned, the row is not
// live, and the next run would warn them again. Message = the repository error's name and message.
export class InactivityFeeNoticeSentButUnflaggedError extends InactivityFeeError {
  level = ErrorLevel.Warn
}

// a monthly run stopped before scanning every dormant account: someone has to re-run it
export class InactivityFeeRunAbortedError extends InactivityFeeError {
  level = ErrorLevel.Critical
}

// the dealer's mid-rate cannot size a debit (the fee floors to 0 sats): the fee run aborts at pin time
export class InactivityFeeInvalidRateError extends InactivityFeeError {
  level = ErrorLevel.Critical
}

// a debit was about to break an invariant the predicate guarantees: unreachable by construction, pages on regression
export class InactivityFeeDebitInvariantError extends InactivityFeeError {
  level = ErrorLevel.Critical
}

// a second live run for the same kind and day; the first one keeps going
export class InactivityFeeRunInProgressError extends InactivityFeeError {
  level = ErrorLevel.Warn
}

// not `ifee_<walletId>_<YYYY-MM>` / `ifee_refund_<walletId>_<YYYY-MM>`, or another wallet's key
export class InvalidInactivityFeeExternalIdError extends ValidationError {}

// a fee stayed unrefunded after a reactivation or claims run: someone has to look
export class InactivityFeeRefundFailedError extends InactivityFeeError {
  level = ErrorLevel.Critical
}

// the request stopped waiting (lock wait or time budget); the refund may still land
export class InactivityFeeReactivationTimeoutError extends InactivityFeeError {
  level = ErrorLevel.Warn
}
