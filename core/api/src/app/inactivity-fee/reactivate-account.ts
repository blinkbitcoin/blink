import { alertFailedRefund } from "./alert-failed-refund"
import { refundInactivityFees } from "./refund-fees"

import { getInactivityFeeConfig } from "@/config"

import {
  InactivityFeeNoticeNotFoundError,
  InactivityFeeReactivationTimeoutError,
  InactivityFeeRefundFailedError,
  InactivityFeeRefundReason,
  InactivityFeeSupersededReason,
  reactivationLockSettings,
  reactivationRunId,
} from "@/domain/inactivity-fee"
import { ResourceAttemptsRedlockServiceError } from "@/domain/lock"
import { ErrorLevel, parseErrorFromUnknown } from "@/domain/shared"

import { LockService } from "@/services/lock"
import { AccountsRepository, InactivityFeeNoticesRepository } from "@/services/mongoose"
import { NotificationsService } from "@/services/notifications"
import {
  addAttributesToCurrentSpan,
  asyncRunInSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"
import { timeoutWithCancel } from "@/utils"

// refund, Welcome-back, then supersede; the budget only stops the request waiting, never the work
export const reactivateAccount = async ({
  accountId,
  previousActivityAt,
}: {
  accountId: AccountId
  previousActivityAt: Date
}): Promise<ReactivateAccountResult | ApplicationError> => {
  const { reactivationLockWaitMs, reactivationBudgetMs } = getInactivityFeeConfig()
  const runId = reactivationRunId({ asOf: new Date() })

  // kept aside so a lock released late cannot turn a finished run into a timeout
  const finished: { result?: ReactivateAccountResult | ApplicationError } = {}
  const budgetState = { expired: false }
  const lockedRun = async (): Promise<ReactivateAccountResult | ApplicationError> => {
    const locked = await LockService().lockInactivityFeeAccount(
      accountId,
      async (signal) => {
        finished.result = await reactivateUnderLock({ accountId, runId, signal })
        return finished.result
      },
      reactivationLockSettings({ waitMs: reactivationLockWaitMs }),
    )
    if (finished.result !== undefined) return finished.result
    if (locked instanceof ResourceAttemptsRedlockServiceError) {
      return new InactivityFeeReactivationTimeoutError(
        `account lock for ${accountId} not acquired within ${reactivationLockWaitMs} ms`,
      )
    }
    return locked
  }
  const work = asyncRunInSpan(
    "app.inactivityfee.reactivateAccount",
    {
      attributes: {
        "inactivityfee.reactivate.accountId": accountId,
        "inactivityfee.reactivate.previousActivityAt": previousActivityAt.toISOString(),
        "inactivityfee.reactivate.runId": runId,
      },
    },
    async () => {
      const result = await lockedRun().catch((err) => parseErrorFromUnknown(err))
      // nobody is waiting any more: a late failure is alerted here, from the span still open
      const lateFailure =
        budgetState.expired &&
        result instanceof Error &&
        // the caller already alerted a timeout
        !(result instanceof InactivityFeeReactivationTimeoutError)
      if (lateFailure) {
        alertFailedRefund({ accountId, error: result })
      }
      return result
    },
  ).catch((err) => parseErrorFromUnknown(err))

  const [budget, cancelBudget] = timeoutWithCancel(
    reactivationBudgetMs,
    `reactivation of ${accountId} still running after ${reactivationBudgetMs} ms`,
  )
  try {
    const result = await Promise.race([work, budget])
    cancelBudget()
    // the race only yields undefined if the budget resolves, which it never does
    if (result === undefined) return new InactivityFeeReactivationTimeoutError(accountId)
    return result
  } catch (err) {
    // the caller alerts this timeout; whatever the work ends with is alerted from its own span
    budgetState.expired = true
    return new InactivityFeeReactivationTimeoutError(parseErrorFromUnknown(err).message)
  }
}

const reactivateUnderLock = async ({
  accountId,
  runId,
  signal,
}: {
  accountId: AccountId
  runId: string
  signal: InactivityFeeAccountAbortSignal
}): Promise<ReactivateAccountResult | ApplicationError> => {
  const refunded = await refundInactivityFees({
    accountId,
    reason: InactivityFeeRefundReason.Activity,
    runId,
    signal,
  })
  if (refunded instanceof Error) return refunded

  const { refundedSats, refundedCents, failures } = refunded
  addAttributesToCurrentSpan({
    "inactivityfee.reactivate.refundedSats": String(refundedSats),
    "inactivityfee.reactivate.refundedCents": String(refundedCents),
    "inactivityfee.reactivate.failures": String(failures.length),
  })

  // sent iff something came back, even when another wallet's refund failed
  if (refundedSats > 0 || refundedCents > 0) {
    const sent = await sendWelcomeBack({ accountId, refundedSats, refundedCents })
    if (sent instanceof Error) {
      recordExceptionInCurrentSpan({ error: sent, level: ErrorLevel.Warn })
    }
  }

  if (failures.length > 0) {
    for (const { error } of failures) {
      recordExceptionInCurrentSpan({ error, level: ErrorLevel.Critical })
    }
    return new InactivityFeeRefundFailedError(
      `${runId}: ${failures.length} refund(s) failed on ${accountId}: ` +
        failures
          .map(({ walletId, externalId, error }) =>
            [walletId, externalId, error.name].filter(Boolean).join(" "),
          )
          .join("; "),
    )
  }

  const superseded = await supersedeIssuedNotice({ accountId })
  if (superseded instanceof Error) return superseded
  addAttributesToCurrentSpan({
    "inactivityfee.reactivate.superseded": String(superseded),
  })

  // pending closure would be cancelled here; closure is not built, so there is nothing to cancel
  return { refundedSats, refundedCents, noticeSuperseded: superseded }
}

const sendWelcomeBack = async ({
  accountId,
  refundedSats,
  refundedCents,
}: {
  accountId: AccountId
  refundedSats: Satoshis
  refundedCents: UsdCents
}): Promise<true | ApplicationError> => {
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  // per balance, never blended; a zero amount is left out
  return NotificationsService().sendInactivityFeeWelcomeBack({
    userId: account.kratosUserId,
    ...(refundedSats > 0 ? { refundedSats } : {}),
    ...(refundedCents > 0 ? { refundedCents } : {}),
  })
}

const supersedeIssuedNotice = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<boolean | ApplicationError> => {
  const notices = InactivityFeeNoticesRepository()
  const notice = await notices.findActiveByAccountId(accountId)
  if (notice instanceof InactivityFeeNoticeNotFoundError) return false
  if (notice instanceof Error) return notice
  // a row whose bulletin never went out stays with the notice job, which re-sends it
  if (!notice.bulletinIssued) return false

  const superseded = await notices.supersede({
    id: notice.id,
    reason: InactivityFeeSupersededReason.Reactivation,
    supersededAt: new Date(),
  })
  if (superseded instanceof InactivityFeeNoticeNotFoundError) return false
  if (superseded instanceof Error) return superseded
  return true
}
