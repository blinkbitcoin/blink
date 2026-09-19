import { DomainError, ErrorLevel } from "@/domain/shared"

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
