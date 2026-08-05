import { reclaimMigrationTopUp } from "./reclaim-top-up"

import { updateAccountStatus } from "@/app/accounts/update-account-status"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { AccountStatus } from "@/domain/accounts"
import { CouldNotFindError } from "@/domain/errors"
import { MigrationFlowPhase } from "@/domain/migration-flow"
import { ErrorLevel } from "@/domain/shared"

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
  const softClosed = await updateAccountStatus({
    accountId,
    status: AccountStatus.Migrated,
    comment: "custodial migration completed",
  })
  if (softClosed instanceof Error) {
    recordExceptionInCurrentSpan({ error: softClosed, level: ErrorLevel.Warn })
  }
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
        const account = await AccountsRepository().findById(flow.accountId)
        if (account instanceof Error) {
          recordExceptionInCurrentSpan({ error: account, level: ErrorLevel.Warn })
          return
        }
        if (account.status !== AccountStatus.Migrated) {
          await softCloseMigratedAccount(flow.accountId)
        }
        return
      }

      if (
        flow.phase !== MigrationFlowPhase.Transferring &&
        flow.phase !== MigrationFlowPhase.Failed
      ) {
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
