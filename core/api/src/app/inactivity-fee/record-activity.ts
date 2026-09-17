import { reactivateAccount } from "./reactivate-account"

import { getInactivityFeeConfig } from "@/config"

import { ActivityKind, isDormantAt } from "@/domain/inactivity-fee"

import { AccountsRepository } from "@/services/mongoose"
import { addAttributesToCurrentSpan } from "@/services/tracing"

// notices are not stored yet; asOf is the replaced timestamp, not the stored one
const hasLiveNotice = async ({
  accountId,
  asOf,
}: {
  accountId: AccountId
  asOf: Date
}): Promise<boolean | ApplicationError> => {
  addAttributesToCurrentSpan({
    "inactivityFee.liveNotice.accountId": accountId,
    "inactivityFee.liveNotice.asOf": asOf.toISOString(),
  })
  return false
}

// the only writer of the account's last-activity timestamp
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
  const shouldReactivate =
    dormant || (await hasLiveNotice({ accountId, asOf: previousActivityAt }))
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
