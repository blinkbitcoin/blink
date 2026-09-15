import { reactivateAccount } from "./reactivate-account"

import { getInactivityFeeConfig } from "@/config"

import { ActivityKind, isDormantAt } from "@/domain/inactivity-fee"

import { AccountsRepository } from "@/services/mongoose"
import { addAttributesToCurrentSpan } from "@/services/tracing"

// Inactivity notices are not stored anywhere yet, so no account has an outstanding one.
const hasLiveNotice = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<boolean | ApplicationError> => {
  addAttributesToCurrentSpan({ "inactivityFee.liveNotice.accountId": accountId })
  return false
}

// The only code that updates an account's last-activity timestamp.
// - login and send always set it to now
// - session (app open, API request) sets it only if the stored value is older than
//   activityRefreshIntervalSec, so a busy user costs one write per interval rather than
//   one per request. That age check is part of the Mongo update itself: no separate read,
//   no cache.
// Errors are returned, never thrown: call sites record them on the span and carry on.
export const recordActivity = async ({
  accountId,
  kind,
}: {
  accountId: AccountId
  kind: ActivityKind
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
  // no previous value: legacy account not backfilled yet, nothing to compare against
  if (previousActivityAt === undefined) return { written: true, previousActivityAt }

  const dormant = isDormantAt({ lastActivityAt: previousActivityAt, asOf: now })
  const shouldReactivate = dormant || (await hasLiveNotice({ accountId }))
  if (shouldReactivate instanceof Error) return shouldReactivate
  addAttributesToCurrentSpan({
    "inactivityFee.dormant": dormant,
    "inactivityFee.reactivate": shouldReactivate,
  })

  if (shouldReactivate) {
    const reactivated = await reactivateAccount({ accountId, previousActivityAt })
    if (reactivated instanceof Error) return reactivated
  }

  return { written: true, previousActivityAt }
}
