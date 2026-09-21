import { InactivityFeeReactivationTimeoutError } from "@/domain/inactivity-fee"
import { ErrorLevel } from "@/domain/shared"

import { addEventToCurrentSpan, recordExceptionInCurrentSpan } from "@/services/tracing"

// a fee may be left unrefunded: Critical whatever the error's own level, Warn only for a timeout
export const alertFailedRefund = ({
  accountId,
  error,
}: {
  accountId: AccountId
  error: Error
}) => {
  recordExceptionInCurrentSpan({
    error,
    level:
      error instanceof InactivityFeeReactivationTimeoutError
        ? ErrorLevel.Warn
        : ErrorLevel.Critical,
  })
  addEventToCurrentSpan("inactivityfee.alert.failed_refund", {
    "inactivityfee.alert.accountId": accountId,
    "inactivityfee.alert.error": error.name,
    "inactivityfee.alert.message": error.message,
  })
}
