import { PaymentStatus } from "@/domain/bitcoin/lightning"
import {
  FailedLnPaymentStates,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"

import { LedgerService } from "@/services/ledger"
import { LndService } from "@/services/lnd"
import { MigrationFlowStateRepository } from "@/services/mongoose"

const checkAttemptMovedNoMoney = async ({
  phase,
  lnPaymentHash,
}: {
  phase: MigrationFlowPhase
  lnPaymentHash: PaymentHash
}): Promise<true | ApplicationError> => {
  const ledgerTxns = await LedgerService().getTransactionsByHash(lnPaymentHash)
  if (ledgerTxns instanceof Error) return ledgerTxns

  if (ledgerTxns.length === 0) return true

  if (phase === MigrationFlowPhase.Transferring) {
    return new MigrationStateConflictError(
      "payment may be in flight — run resume before granting retry",
    )
  }

  const paymentState = LnPaymentStateDeterminator(ledgerTxns).determine()
  if (paymentState instanceof Error) return paymentState

  if (!FailedLnPaymentStates.includes(paymentState)) {
    return new MigrationStateConflictError(
      `prior attempt is not terminally failed (${paymentState}) — the settle path owns it`,
    )
  }

  // the ledger void is blink's own conclusion; only LND can prove no HTLC is still
  // outstanding — an in-flight payment settling after the $unset would double-credit
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

// a mid-send transfer has a bound hash but no ledger txn yet — indistinguishable from a
// crash — and keeps bumping updatedAt via recordTopUp until its ledger entry lands
const TRANSFER_WEDGE_THRESHOLD_MS = 30 * 60 * 1000

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

  if (
    flow.phase !== MigrationFlowPhase.Failed &&
    flow.phase !== MigrationFlowPhase.Transferring
  ) {
    return new MigrationStateConflictError(
      `retry is only grantable from a stuck migration: phase is ${flow.phase}`,
    )
  }

  if (
    flow.phase === MigrationFlowPhase.Transferring &&
    Date.now() - flow.updatedAt.getTime() < TRANSFER_WEDGE_THRESHOLD_MS
  ) {
    return new MigrationStateConflictError(
      "transfer may still be running — retry is grantable 30m after the last flow update",
    )
  }

  // the guard has to run before resetForRetry unbinds the hash: after the $unset a
  // lookup by the stale hash silently no-ops
  if (flow.lnPaymentHash) {
    const guard = await checkAttemptMovedNoMoney({
      phase: flow.phase,
      lnPaymentHash: flow.lnPaymentHash,
    })
    if (guard instanceof Error) return guard
  }

  return migrationFlowRepo.resetForRetry({
    accountId,
    fromPhase: flow.phase,
    grantedBy: updatedByPrivilegedClientId,
  })
}
