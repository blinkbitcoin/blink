import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "./settle-migration-flow"

import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"

import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"

// Every terminal bundle_completion_state; a flow may only be completed or
// failed off a ledger whose recorded state is one of these. ln_payment.pending
// and ln_payment.pending_after_retry mean the settle/void path has not yet
// recorded its final verdict.
const TERMINAL_LN_PAYMENT_STATES: LnPaymentState[] = [
  LnPaymentState.Success,
  LnPaymentState.SuccessWithReimbursement,
  LnPaymentState.SuccessAfterRetry,
  LnPaymentState.SuccessWithReimbursementAfterRetry,
  LnPaymentState.Failed,
  LnPaymentState.FailedAfterRetry,
  LnPaymentState.FailedAfterSuccess,
  LnPaymentState.FailedAfterSuccessWithReimbursement,
]

import { MigrationFlowPhase } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import { baseLogger } from "@/services/logger"
import { MigrationFlowStateRepository } from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

export const resumeMigrationFlow = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<MigrationFlow | ApplicationError> => {
  const migrationFlowRepo = MigrationFlowStateRepository()

  const flow = await migrationFlowRepo.findByAccountId(accountId)
  if (flow instanceof Error) return flow

  if (flow.phase !== MigrationFlowPhase.Transferring || !flow.lnPaymentHash) {
    return flow
  }
  const { lnPaymentHash } = flow

  const reconciled = await updatePendingPaymentByHash({
    paymentHash: lnPaymentHash,
    logger: baseLogger,
  })
  if (reconciled instanceof Error) {
    recordExceptionInCurrentSpan({ error: reconciled, level: ErrorLevel.Warn })
  }

  const updated = await migrationFlowRepo.findByAccountId(accountId)
  if (updated instanceof Error) return updated
  if (updated.phase !== MigrationFlowPhase.Transferring) return updated

  // still Transferring here means an earlier run recorded the ledger verdict but
  // died before its migration hook fired — and updatePendingPaymentByHash skips
  // already-recorded hashes without re-firing hooks, so no retry will ever tell
  // the flow. Read the verdict out of the ledger and apply it to the flow here.
  const ledgerTxns = await LedgerService().getTransactionsByHash(lnPaymentHash)
  if (ledgerTxns instanceof Error) {
    recordExceptionInCurrentSpan({ error: ledgerTxns, level: ErrorLevel.Warn })
    return updated
  }

  const paymentState = LnPaymentStateDeterminator(ledgerTxns).determine()
  if (paymentState instanceof Error) {
    recordExceptionInCurrentSpan({ error: paymentState, level: ErrorLevel.Warn })
    return updated
  }

  // A settle/void in flight flips pendingConfirmation before its finalize step
  // records the terminal bundle_completion_state. During that window the bundle
  // below still shows its last recorded state, which is Pending for a payment
  // being settled, so re-determining it would read "Success" off the interim
  // single-debit shape. Only a state already recorded as terminal is safe to
  // act on here; anything else keeps waiting for the settle path to finish.
  const recordedStates = new Set(
    ledgerTxns.map((txn) => txn.lnPaymentState).filter((state) => !!state),
  )
  const stateIsRecordedAsTerminal = [...recordedStates].some((state) =>
    TERMINAL_LN_PAYMENT_STATES.includes(state),
  )
  if (!stateIsRecordedAsTerminal) {
    addAttributesToCurrentSpan({
      "migrationFlow.awaitingRecordedVerdict": paymentState,
    })
    return updated
  }

  switch (paymentState) {
    case LnPaymentState.Success:
    case LnPaymentState.SuccessWithReimbursement:
    case LnPaymentState.SuccessAfterRetry:
    case LnPaymentState.SuccessWithReimbursementAfterRetry:
      await completeMigrationFlowForSettledPayment({ paymentHash: lnPaymentHash })
      break
    case LnPaymentState.Failed:
    case LnPaymentState.FailedAfterRetry:
    case LnPaymentState.FailedAfterSuccess:
    case LnPaymentState.FailedAfterSuccessWithReimbursement:
      await failMigrationFlowForFailedPayment({ paymentHash: lnPaymentHash })
      break
    default:
      return updated
  }

  return migrationFlowRepo.findByAccountId(accountId)
}
