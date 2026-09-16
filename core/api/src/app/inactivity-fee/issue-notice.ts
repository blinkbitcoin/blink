import {
  InactivityFeeNoticeSentButUnflaggedError,
  noticeEffectiveDate,
} from "@/domain/inactivity-fee"

import { InactivityFeeNoticesRepository } from "@/services/mongoose"
import { NotificationsService } from "@/services/notifications"

// Send the bulletin + push for an existing non-issued row, then flip it. The row exists
// before the call so a crash in between leaves a non-live row to re-send next month, never
// a warned account with no record. `pushSent` means the service accepted the event (it
// enqueues the push itself), never delivery. issuedAt is re-stamped with the send time so
// the effective date in the copy and the liveness comparison agree, also on a resend. A flip
// that fails after a successful send is reported as its own error: the user was warned.
export const issueNotice = async ({
  notice,
  account,
  issuedAt,
  config,
}: {
  notice: InactivityFeeNotice
  account: Account
  issuedAt: Date
  config: InactivityFeeConfig
}): Promise<InactivityFeeNotice | ApplicationError> => {
  const sent = await NotificationsService().sendInactivityFeeNotice({
    userId: account.kratosUserId,
    effectiveDate: noticeEffectiveDate({ issuedAt, effectiveFrom: config.effectiveFrom }),
  })
  if (sent instanceof Error) return sent

  const marked = await InactivityFeeNoticesRepository().markBulletinIssued({
    id: notice.id,
    issuedAt,
    pushSent: true,
  })
  if (marked instanceof Error) {
    return new InactivityFeeNoticeSentButUnflaggedError(
      `${marked.name}: ${marked.message}`,
    )
  }
  return marked
}
