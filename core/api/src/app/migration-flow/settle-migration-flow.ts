import { reclaimMigrationTopUp } from "./reclaim-top-up"

import { updateAccountStatus } from "@/app/accounts/update-account-status"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { AccountStatus } from "@/domain/accounts"
import { PaymentStatus } from "@/domain/bitcoin/lightning"
import { CouldNotFindError } from "@/domain/errors"
import {
  LnPaymentState,
  LnPaymentStateDeterminator,
} from "@/domain/ledger/ln-payment-state"
import { MigrationFlowPhase, MigrationStateConflictError } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import { LndService } from "@/services/lnd"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
  wrapAsyncToRunInSpan,
} from "@/services/tracing"

const findFlowByHash = async (
  paymentHash: PaymentHash,
): Promise<MigrationFlow | undefined> => {
  const flow = await MigrationFlowStateRepository().findByLnPaymentHash(paymentHash)
  if (flow instanceof CouldNotFindError) return undefined
  if (flow instanceof Error) {
    recordExceptionInCurrentSpan({ error: flow, level: ErrorLevel.Warn })
    return undefined
  }
  return flow
}

const softCloseMigratedAccount = async (accountId: AccountId): Promise<void> => {
  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) {
    recordExceptionInCurrentSpan({ error: account, level: ErrorLevel.Warn })
    return
  }
  if (account.status !== AccountStatus.Active) {
    if (
      account.status !== AccountStatus.Migrated &&
      account.status !== AccountStatus.Closed
    ) {
      recordExceptionInCurrentSpan({
        error: new MigrationStateConflictError(
          `soft-close skipped for account ${accountId} in status: ${account.status}`,
        ),
        level: ErrorLevel.Warn,
      })
    }
    return
  }

  const softClosed = await updateAccountStatus({
    accountId,
    status: AccountStatus.Migrated,
    comment: "custodial migration completed",
  })
  if (softClosed instanceof Error) {
    recordExceptionInCurrentSpan({ error: softClosed, level: ErrorLevel.Warn })
  }
}

const settledLedgerStates: ReadonlySet<LnPaymentState> = new Set([
  LnPaymentState.Success,
  LnPaymentState.SuccessWithReimbursement,
  LnPaymentState.SuccessAfterRetry,
  LnPaymentState.SuccessWithReimbursementAfterRetry,
])

// Completing a flow soft-closes the account, so require both the ledger and lnd
// to agree the drain settled. A ledger read taken while the trigger is reverting
// a failed payment (journal voided, reversal not yet written) looks settled on
// its own; lnd never does. Flows that skipped the transfer (zero balance) have
// no payment to check.
const TRANSFER_SKIPPED_STEP = "transfer-skipped"

const paymentSettled = async (
  flow: MigrationFlow,
  paymentHash: PaymentHash,
): Promise<true | MigrationStateConflictError> => {
  if (flow.steps.some((step) => step.step === TRANSFER_SKIPPED_STEP)) return true

  const conflict = (detail: string) =>
    new MigrationStateConflictError(
      `refusing to complete migration for account ${flow.accountId} (${paymentHash}): ${detail}`,
    )

  const ledgerTxns = await LedgerService().getTransactionsByHash(paymentHash)
  if (ledgerTxns instanceof Error) {
    return conflict(`ledger lookup failed: ${ledgerTxns.name}: ${ledgerTxns.message}`)
  }
  if (ledgerTxns.length === 0) return conflict("no ledger entries")

  const newest = [...ledgerTxns].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  )[0]
  if (newest.voided) return conflict("latest ledger entry is voided")

  const paymentState = LnPaymentStateDeterminator(ledgerTxns).determine()
  if (paymentState instanceof Error) return conflict(paymentState.message)
  if (!settledLedgerStates.has(paymentState)) {
    return conflict(`ledger state is ${paymentState}`)
  }

  const lndService = LndService()
  if (lndService instanceof Error) {
    return conflict(`lnd unavailable: ${lndService.name}: ${lndService.message}`)
  }
  const pubkey = ledgerTxns.find((tx) => tx.pubkey)?.pubkey
  const lnPayment = await lndService.lookupPayment({ pubkey, paymentHash })
  if (lnPayment instanceof Error) {
    return conflict(`lnd lookup failed: ${lnPayment.name}: ${lnPayment.message}`)
  }
  if (lnPayment.status !== PaymentStatus.Settled) {
    return conflict(`lnd status is ${lnPayment.status}`)
  }

  return true
}

const residualBalanceDetail = async (accountId: AccountId): Promise<string> => {
  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) return "residual balance: unknown"

  const balance = await getBalanceForWallet({ walletId: accountWallets.BTC.id })
  if (balance instanceof Error) return "residual balance: unknown"

  return `residual balance: ${balance} sats`
}

export const completeMigrationFlowForSettledPayment = wrapAsyncToRunInSpan({
  namespace: "app.migrationflow",
  fnName: "completeMigrationFlowForSettledPayment",
  fn: async ({ paymentHash }: { paymentHash: PaymentHash }): Promise<void> => {
    try {
      const flow = await findFlowByHash(paymentHash)
      if (flow === undefined) return

      addAttributesToCurrentSpan({ "migrationFlow.accountId": flow.accountId })

      if (flow.phase === MigrationFlowPhase.Completed) {
        await softCloseMigratedAccount(flow.accountId)
        return
      }

      if (
        flow.phase !== MigrationFlowPhase.Transferring &&
        flow.phase !== MigrationFlowPhase.Failed
      ) {
        return
      }

      const settled = await paymentSettled(flow, paymentHash)
      if (settled instanceof Error) {
        recordExceptionInCurrentSpan({ error: settled, level: ErrorLevel.Warn })
        return
      }

      const completed = await MigrationFlowStateRepository().updatePhase({
        accountId: flow.accountId,
        fromPhase: flow.phase,
        toPhase: MigrationFlowPhase.Completed,
        step: {
          step: "transfer-settled",
          detail: await residualBalanceDetail(flow.accountId),
        },
      })
      if (completed instanceof Error) {
        recordExceptionInCurrentSpan({ error: completed, level: ErrorLevel.Warn })
        return
      }
      addAttributesToCurrentSpan({ "migrationFlow.completed": true })

      await softCloseMigratedAccount(flow.accountId)
    } catch (err) {
      recordExceptionInCurrentSpan({ error: err, level: ErrorLevel.Warn })
    }
  },
})

export const failMigrationFlowForFailedPayment = wrapAsyncToRunInSpan({
  namespace: "app.migrationflow",
  fnName: "failMigrationFlowForFailedPayment",
  fn: async ({ paymentHash }: { paymentHash: PaymentHash }): Promise<void> => {
    try {
      const flow = await findFlowByHash(paymentHash)
      if (flow === undefined || flow.phase !== MigrationFlowPhase.Transferring) return

      addAttributesToCurrentSpan({ "migrationFlow.accountId": flow.accountId })

      const failed = await MigrationFlowStateRepository().updatePhase({
        accountId: flow.accountId,
        fromPhase: MigrationFlowPhase.Transferring,
        toPhase: MigrationFlowPhase.Failed,
        step: { step: "transfer-failed", detail: "ln payment failed" },
      })
      if (failed instanceof Error) {
        recordExceptionInCurrentSpan({ error: failed, level: ErrorLevel.Warn })
        return
      }
      addAttributesToCurrentSpan({ "migrationFlow.failed": true })

      if (flow.topUpSats !== undefined) {
        await reclaimMigrationTopUp({
          accountId: flow.accountId,
          topUpSats: flow.topUpSats,
        })
      }
    } catch (err) {
      recordExceptionInCurrentSpan({ error: err, level: ErrorLevel.Warn })
    }
  },
})
