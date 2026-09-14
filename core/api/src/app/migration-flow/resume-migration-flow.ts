import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "./settle-migration-flow"

import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"

import { PaymentStatus } from "@/domain/bitcoin/lightning"
import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { getTransactionsForWalletsByPaymentHash } from "@/services/ledger/facade"
import { LndService } from "@/services/lnd"
import { LockService } from "@/services/lock"
import { baseLogger } from "@/services/logger"
import { MigrationFlowStateRepository, WalletsRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

type Verdict = {
  lndStatus: PaymentStatus
  apply: (args: { paymentHash: PaymentHash }) => Promise<void>
}

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
  //
  // The trigger reverts a failed payment in several ledger writes (pending flag
  // cleared, journal voided, reversal inserted) while holding the wallet lock. A
  // read in between those writes looks like a settled payment, so read under the
  // same lock and only trust a verdict lnd agrees with. The verdict is applied
  // after the lock is released: the fail hook reclaims the top-up through an
  // intraledger send that takes this wallet lock again.
  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) {
    recordExceptionInCurrentSpan({ error: accountWallets, level: ErrorLevel.Warn })
    return updated
  }

  const walletIds = [accountWallets.BTC.id, accountWallets.USD.id]
  const resolved = await LockService().lockWalletId(
    accountWallets.BTC.id,
    async (signal) => {
      const verdict = await resolveLedgerVerdict({ accountId, walletIds, lnPaymentHash })
      if (signal.aborted) {
        return new ResourceExpiredLockServiceError(signal.error?.message)
      }
      return verdict
    },
  )
  if (resolved instanceof Error) {
    recordExceptionInCurrentSpan({ error: resolved, level: ErrorLevel.Warn })
    return updated
  }
  if (resolved !== undefined) {
    await resolved.apply({ paymentHash: lnPaymentHash })
  }

  return migrationFlowRepo.findByAccountId(accountId)
}

// Runs under the wallet lock. Returns the verdict to apply, or undefined when
// the flow has moved on, the ledger is not conclusive, or lnd does not agree.
const resolveLedgerVerdict = async ({
  accountId,
  walletIds,
  lnPaymentHash,
}: {
  accountId: AccountId
  walletIds: WalletId[]
  lnPaymentHash: PaymentHash
}): Promise<Verdict | undefined | ApplicationError> => {
  const current = await MigrationFlowStateRepository().findByAccountId(accountId)
  if (current instanceof Error) return current
  if (current.phase !== MigrationFlowPhase.Transferring) return undefined

  // scoped to the account's wallets: the by-hash bundle also carries the bank
  // owner's fee-reserve entries, which the determinator does not classify
  const ledgerTxns = await getTransactionsForWalletsByPaymentHash({
    walletIds,
    paymentHash: lnPaymentHash,
  })
  if (ledgerTxns instanceof Error) {
    recordExceptionInCurrentSpan({ error: ledgerTxns, level: ErrorLevel.Warn })
    return undefined
  }

  const paymentState = LnPaymentStateDeterminator(ledgerTxns).determine()
  if (paymentState instanceof Error) {
    recordExceptionInCurrentSpan({ error: paymentState, level: ErrorLevel.Warn })
    return undefined
  }

  const verdict = verdictFor(paymentState)
  if (verdict === undefined) return undefined

  const lndService = LndService()
  if (lndService instanceof Error) {
    recordExceptionInCurrentSpan({ error: lndService, level: ErrorLevel.Warn })
    return undefined
  }
  const pubkey = ledgerTxns.find((tx) => tx.pubkey)?.pubkey
  const lnPayment = await lndService.lookupPayment({ pubkey, paymentHash: lnPaymentHash })
  if (lnPayment instanceof Error) {
    recordExceptionInCurrentSpan({ error: lnPayment, level: ErrorLevel.Warn })
    return undefined
  }
  if (lnPayment.status !== verdict.lndStatus) {
    recordExceptionInCurrentSpan({
      error: new MigrationStateConflictError(
        `account ${accountId}: ledger says ${paymentState} but lnd says ${lnPayment.status} for ${lnPaymentHash}`,
      ),
      level: ErrorLevel.Warn,
    })
    return undefined
  }

  return verdict
}

const verdictFor = (paymentState: LnPaymentState): Verdict | undefined => {
  switch (paymentState) {
    case LnPaymentState.Success:
    case LnPaymentState.SuccessWithReimbursement:
    case LnPaymentState.SuccessAfterRetry:
    case LnPaymentState.SuccessWithReimbursementAfterRetry:
      return {
        lndStatus: PaymentStatus.Settled,
        apply: completeMigrationFlowForSettledPayment,
      }
    case LnPaymentState.Failed:
    case LnPaymentState.FailedAfterRetry:
    case LnPaymentState.FailedAfterSuccess:
    case LnPaymentState.FailedAfterSuccessWithReimbursement:
      return {
        lndStatus: PaymentStatus.Failed,
        apply: failMigrationFlowForFailedPayment,
      }
    default:
      return undefined
  }
}
