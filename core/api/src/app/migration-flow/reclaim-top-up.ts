import { intraledgerPaymentSendWalletIdForBtcWallet } from "@/app/payments/send-intraledger"
import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { toSats } from "@/domain/bitcoin"
import { ErrorLevel } from "@/domain/shared"

import { getBankOwnerWalletId } from "@/services/ledger/caching"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { recordExceptionInCurrentSpan, wrapAsyncToRunInSpan } from "@/services/tracing"

const recordReclaimFailed = async (
  accountId: AccountId,
  detail: string,
): Promise<void> => {
  const recorded = await MigrationFlowStateRepository().addStep({
    accountId,
    step: { step: "top-up-reclaim-failed", detail },
  })
  if (recorded instanceof Error) {
    recordExceptionInCurrentSpan({ error: recorded, level: ErrorLevel.Warn })
  }
}

export const reclaimMigrationTopUp = wrapAsyncToRunInSpan({
  namespace: "app.migrationflow",
  fnName: "reclaimMigrationTopUp",
  fn: async ({
    accountId,
    topUpSats,
  }: {
    accountId: AccountId
    topUpSats: Satoshis
  }): Promise<void> => {
    try {
      const account = await AccountsRepository().findById(accountId)
      if (account instanceof Error) {
        recordExceptionInCurrentSpan({ error: account, level: ErrorLevel.Warn })
        return recordReclaimFailed(accountId, `account lookup failed: ${account.name}`)
      }

      const accountWallets =
        await WalletsRepository().findAccountWalletsByAccountId(accountId)
      if (accountWallets instanceof Error) {
        recordExceptionInCurrentSpan({ error: accountWallets, level: ErrorLevel.Warn })
        return recordReclaimFailed(
          accountId,
          `wallet lookup failed: ${accountWallets.name}`,
        )
      }

      const balance = await getBalanceForWallet({ walletId: accountWallets.BTC.id })
      if (balance instanceof Error) {
        recordExceptionInCurrentSpan({ error: balance, level: ErrorLevel.Warn })
        return recordReclaimFailed(accountId, `balance lookup failed: ${balance.name}`)
      }

      const balanceSats = BigInt(balance)
      const amount = balanceSats < BigInt(topUpSats) ? balanceSats : BigInt(topUpSats)
      if (amount <= 0n) {
        return recordReclaimFailed(accountId, `no balance to reclaim: ${balance} sats`)
      }

      const bankOwnerWalletId = await getBankOwnerWalletId()
      const reclaimed = await intraledgerPaymentSendWalletIdForBtcWallet({
        recipientWalletId: bankOwnerWalletId,
        amount: toSats(amount),
        memo: "custodial migration top-up reclaim",
        senderWalletId: accountWallets.BTC.id,
        senderAccount: account,
      })
      if (reclaimed instanceof Error) {
        recordExceptionInCurrentSpan({ error: reclaimed, level: ErrorLevel.Warn })
        return recordReclaimFailed(accountId, `reclaim send failed: ${reclaimed.name}`)
      }

      const cleared = await MigrationFlowStateRepository().clearTopUp({
        accountId,
        step: {
          step: "top-up-reclaimed",
          detail: `${amount} sats returned to bank owner`,
        },
      })
      if (cleared instanceof Error) {
        recordExceptionInCurrentSpan({ error: cleared, level: ErrorLevel.Warn })
      }
    } catch (err) {
      recordExceptionInCurrentSpan({ error: err, level: ErrorLevel.Warn })
      await recordReclaimFailed(accountId, `unexpected: ${err}`)
    }
  },
})
