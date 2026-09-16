import {
  completeMigrationFlowForSettledPayment,
  failMigrationFlowForFailedPayment,
} from "./settle-migration-flow"

import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"

import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { ResourceExpiredLockServiceError } from "@/domain/lock"
import { MigrationFlowPhase } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { getTransactionsForWalletsByPaymentHash } from "@/services/ledger/facade"
import { LockService } from "@/services/lock"
import { baseLogger } from "@/services/logger"
import { MigrationFlowStateRepository, WalletsRepository } from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

type MigrationHook = (args: { paymentHash: PaymentHash }) => Promise<void>

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
  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) {
    recordExceptionInCurrentSpan({ error: accountWallets, level: ErrorLevel.Warn })
    return updated
  }

  // The trigger reverts a failed payment in several ledger writes while holding
  // the wallet lock, so read the ledger under the same lock. The hook runs after
  // the lock is released because the fail hook takes it again.
  const hook = await LockService().lockWalletId(accountWallets.BTC.id, async (signal) => {
    const hook = await hookFromLedger({
      accountId,
      walletIds: [accountWallets.BTC.id, accountWallets.USD.id],
      lnPaymentHash,
    })
    if (signal.aborted) {
      return new ResourceExpiredLockServiceError(signal.error?.message)
    }
    return hook
  })
  if (hook instanceof Error) {
    recordExceptionInCurrentSpan({ error: hook, level: ErrorLevel.Warn })
    return updated
  }
  if (hook !== undefined) {
    await hook({ paymentHash: lnPaymentHash })
  }

  return migrationFlowRepo.findByAccountId(accountId)
}

const hookFromLedger = async ({
  accountId,
  walletIds,
  lnPaymentHash,
}: {
  accountId: AccountId
  walletIds: WalletId[]
  lnPaymentHash: PaymentHash
}): Promise<MigrationHook | undefined | ApplicationError> => {
  const current = await MigrationFlowStateRepository().findByAccountId(accountId)
  if (current instanceof Error) return current
  if (current.phase !== MigrationFlowPhase.Transferring) return undefined

  // only the account's wallets: the bank owner's fee entries share the hash
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

  return hookFor(paymentState)
}

const hookFor = (paymentState: LnPaymentState): MigrationHook | undefined => {
  switch (paymentState) {
    case LnPaymentState.Success:
    case LnPaymentState.SuccessWithReimbursement:
    case LnPaymentState.SuccessAfterRetry:
    case LnPaymentState.SuccessWithReimbursementAfterRetry:
      return completeMigrationFlowForSettledPayment
    case LnPaymentState.Failed:
    case LnPaymentState.FailedAfterRetry:
    case LnPaymentState.FailedAfterSuccess:
    case LnPaymentState.FailedAfterSuccessWithReimbursement:
      return failMigrationFlowForFailedPayment
    default:
      return undefined
  }
}
