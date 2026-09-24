import { refundInactivityFees } from "./refund-fees"

import {
  InactivityFeeNoticeNotFoundError,
  InactivityFeeRefundReason,
} from "@/domain/inactivity-fee"

import { LockService } from "@/services/lock"
import { InactivityFeeNoticesRepository } from "@/services/mongoose"

// The account lock lapsed during a live charge: a reactivation may have run in that gap, found
// no debit yet and retired the notice, leaving nothing to refund a debit that landed after it.
// Re-checked under a fresh lock: no active notice left ⇒ the account came back, refund what it
// holds. A notice still active is left alone: the next activity write reactivates and refunds.
export const reconcileLapsedCharge = async ({
  accountId,
  runId,
}: {
  accountId: AccountId
  runId: string
}): Promise<InactivityFeeRefundResult | false | ApplicationError> => {
  // kept aside so a lock released late cannot turn posted refunds into an error
  const finished: { result?: InactivityFeeRefundResult | false | ApplicationError } = {}
  const locked = await LockService().lockInactivityFeeAccount(
    accountId,
    async (signal) => {
      const notice =
        await InactivityFeeNoticesRepository().findActiveByAccountId(accountId)
      if (!(notice instanceof InactivityFeeNoticeNotFoundError)) {
        finished.result = notice instanceof Error ? notice : false
        return finished.result
      }
      finished.result = await refundInactivityFees({
        accountId,
        reason: InactivityFeeRefundReason.Activity,
        runId,
        signal,
      })
      return finished.result
    },
  )
  return finished.result ?? locked
}
