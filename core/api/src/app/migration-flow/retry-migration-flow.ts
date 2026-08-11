import { PaymentStatus } from "@/domain/bitcoin/lightning"
import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"

import { LedgerService } from "@/services/ledger"
import { LndService } from "@/services/lnd"
import { MigrationFlowStateRepository } from "@/services/mongoose"

const checkAttemptMovedNoMoney = async (
  lnPaymentHash: PaymentHash,
): Promise<true | ApplicationError> => {
  const ledgerTxns = await LedgerService().getTransactionsByHash(lnPaymentHash)
  if (ledgerTxns instanceof Error) return ledgerTxns

  if (ledgerTxns.length === 0) return true

  const paymentState = LnPaymentStateDeterminator(ledgerTxns).determine()
  if (paymentState instanceof Error) return paymentState

  switch (paymentState) {
    case LnPaymentState.Failed:
    case LnPaymentState.FailedAfterRetry:
    case LnPaymentState.FailedAfterSuccess:
    case LnPaymentState.FailedAfterSuccessWithReimbursement:
      break
    default:
      return new MigrationStateConflictError(
        `prior attempt is not terminally failed (${paymentState}) — the settle path owns it`,
      )
  }

  // a void is blink's conclusion, not LND's receipt; only LND proves no HTLC is in flight
  const lndService = LndService()
  if (lndService instanceof Error) return lndService

  const lnPayment = await lndService.lookupPayment({ paymentHash: lnPaymentHash })
  if (lnPayment instanceof Error) return lnPayment

  if (lnPayment.status !== PaymentStatus.Failed) {
    return new MigrationStateConflictError(
      `LND reports the prior attempt as ${lnPayment.status} — never reset a payment that may still settle`,
    )
  }

  return true
}

export const retryMigrationFlow = async ({
  accountId,
  updatedByPrivilegedClientId,
}: {
  accountId: AccountId
  updatedByPrivilegedClientId: PrivilegedClientId
}): Promise<MigrationFlow | ApplicationError> => {
  const migrationFlowRepo = MigrationFlowStateRepository()

  const flow = await migrationFlowRepo.findByAccountId(accountId)
  if (flow instanceof Error) return flow

  if (flow.phase !== MigrationFlowPhase.Failed) {
    return new MigrationStateConflictError(
      `retry is only grantable from a FAILED migration: phase is ${flow.phase}`,
    )
  }

  // the guard has to run before resetForRetry unbinds the hash: after the $unset a
  // lookup by the stale hash silently no-ops
  if (flow.lnPaymentHash) {
    const guard = await checkAttemptMovedNoMoney(flow.lnPaymentHash)
    if (guard instanceof Error) return guard
  }

  return migrationFlowRepo.resetForRetry({
    accountId,
    fromPhase: flow.phase,
    grantedBy: updatedByPrivilegedClientId,
  })
}
