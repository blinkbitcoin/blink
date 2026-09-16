import { reactivateAccount } from "./reactivate-account"

import { getInactivityFeeConfig } from "@/config"

import { ActivityKind, isDormantAt } from "@/domain/inactivity-fee"

import { AccountsRepository } from "@/services/mongoose"
import { addAttributesToCurrentSpan } from "@/services/tracing"

// Inactivity notices are not stored anywhere yet, so no account has an outstanding one.
// `asOf` is the timestamp this action replaced, and the question has to be asked as of that
// moment: a notice only counts while it was issued after the account's last activity, and the
// stored timestamp has already been moved to now by the update above.
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

// The only code that updates an account's last-activity timestamp. Session writes are
// rate-limited so a busy user costs one write per interval rather than one per request;
// the age check is part of the Mongo update itself, so two concurrent requests cannot both
// see the same stale value.
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
  // undefined means the account predates the field and has not been seeded yet, so there is
  // no earlier activity to compare against
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
