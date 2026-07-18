import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "./settle-migration-flow"

import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"

import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { MigrationFlowPhase } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import { baseLogger } from "@/services/logger"
import { MigrationFlowStateRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

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
