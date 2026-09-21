import { alertFailedRefund } from "./alert-failed-refund"
import { reactivateAccount } from "./reactivate-account"

import { getInactivityFeeConfig } from "@/config"

import {
  ActivityKind,
  InactivityFeeNoticeNotFoundError,
  isDormantAt,
} from "@/domain/inactivity-fee"
import { parseErrorFromUnknown } from "@/domain/shared"

import { AccountsRepository, InactivityFeeNoticesRepository } from "@/services/mongoose"
import { addAttributesToCurrentSpan } from "@/services/tracing"

// status only, no timestamp test: a failed reactivation is retried by the next activity write
const hasIssuedActiveNotice = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<boolean | ApplicationError> => {
  const notice = await InactivityFeeNoticesRepository().findActiveByAccountId(accountId)
  if (notice instanceof InactivityFeeNoticeNotFoundError) return false
  if (notice instanceof Error) return notice
  return notice.bulletinIssued
}

// reactivation never costs the caller its request: a failure ends here as a span error and an alert
const reactivateContained = async ({
  accountId,
  previousActivityAt,
}: {
  accountId: AccountId
  previousActivityAt: Date
}): Promise<void> => {
  try {
    const reactivated = await reactivateAccount({ accountId, previousActivityAt })
    if (reactivated instanceof Error) alertFailedRefund({ accountId, error: reactivated })
  } catch (err) {
    alertFailedRefund({ accountId, error: parseErrorFromUnknown(err) })
  }
}

// the only writer of the account's last-activity timestamp; login always writes, session
// writes at most once per interval
export const recordActivity = async ({
  accountId,
  kind,
  knownLastActivityAt,
}: {
  accountId: AccountId
  kind: ActivityKind
  knownLastActivityAt?: Date
}): Promise<RecordAccountActivityResult | ApplicationError> => {
  const now = new Date()
  const onlyIfOlderThan =
    kind === ActivityKind.Session
      ? new Date(
          now.getTime() - getInactivityFeeConfig().activityRefreshIntervalSec * 1000,
        )
      : undefined

  addAttributesToCurrentSpan({
    "inactivityFee.accountId": accountId,
    "inactivityFee.kind": kind,
  })

  // a fresh caller-held value cannot match the update below; the timestamp never decreases
  if (
    onlyIfOlderThan !== undefined &&
    knownLastActivityAt !== undefined &&
    knownLastActivityAt.getTime() >= onlyIfOlderThan.getTime()
  ) {
    addAttributesToCurrentSpan({
      "inactivityFee.written": false,
      "inactivityFee.skippedRoundTrip": true,
    })
    return { written: false }
  }

  const result = await AccountsRepository().recordActivity({
    id: accountId,
    now,
    onlyIfOlderThan,
  })
  if (result instanceof Error) return result

  addAttributesToCurrentSpan({ "inactivityFee.written": result.written })
  if (!result.written) return { written: false }

  const { previousActivityAt } = result
  addAttributesToCurrentSpan({
    "inactivityFee.previousActivityAt": previousActivityAt?.toISOString() ?? "none",
  })
  // not seeded yet: nothing to compare against
  if (previousActivityAt === undefined) return { written: true, previousActivityAt }

  const dormant = isDormantAt({ lastActivityAt: previousActivityAt, asOf: now })
  const noticed = dormant || (await hasIssuedActiveNotice({ accountId }))
  // a failed lookup is retried by the next activity write, like a failed refund
  if (noticed instanceof Error) alertFailedRefund({ accountId, error: noticed })
  const shouldReactivate = noticed === true
  addAttributesToCurrentSpan({
    "inactivityFee.dormant": dormant,
    "inactivityFee.reactivate": shouldReactivate,
  })

  if (shouldReactivate) await reactivateContained({ accountId, previousActivityAt })

  return { written: true, previousActivityAt }
}
