import { checkDepositHold } from "./check-deposit-hold"
import { migrationDrainPlan, reserveForAmount } from "./execute-transfer"

import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { getCustodialMigrationFlowConfig } from "@/config"

import { toSats } from "@/domain/bitcoin"
import { CouldNotFindError } from "@/domain/errors"
import { MigrationOnHoldError } from "@/domain/migration-flow"

import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"

const previewDepositHold = async ({
  accountId,
  btcWalletDescriptor,
}: {
  accountId: AccountId
  btcWalletDescriptor: WalletDescriptor<"BTC">
}): Promise<boolean | ApplicationError> => {
  if (getCustodialMigrationFlowConfig().recentDepositThresholdUsdCents === 0) {
    return false
  }

  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  const flow = await MigrationFlowStateRepository().findByAccountId(accountId)
  if (flow instanceof Error && !(flow instanceof CouldNotFindError)) return flow
  const pinnedThresholdSats = flow instanceof Error ? undefined : flow.holdThresholdSats

  const holdCheck = await checkDepositHold({
    account,
    btcWalletDescriptor,
    pinnedThresholdSats,
  })
  if (holdCheck instanceof MigrationOnHoldError) return true
  if (holdCheck instanceof Error) return holdCheck

  return false
}

export const getMigrationPreview = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<MigrationPreview | ApplicationError> => {
  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) return accountWallets

  const onHold = await previewDepositHold({
    accountId,
    btcWalletDescriptor: accountWallets.BTC,
  })
  if (onHold instanceof Error) return onHold

  const balance = await getBalanceForWallet({ walletId: accountWallets.BTC.id })
  if (balance instanceof Error) return balance

  const balanceSats = BigInt(balance)

  if (balanceSats <= 0n) {
    return {
      balanceSats: toSats(0),
      feeSats: toSats(0),
      feeCoveredByBlink: false,
      receiveSats: toSats(0),
      onHold,
    }
  }

  const { deMinimisThresholdSats } = getCustodialMigrationFlowConfig()

  if (balanceSats <= BigInt(deMinimisThresholdSats)) {
    return {
      balanceSats: toSats(balanceSats),
      feeSats: toSats(reserveForAmount(balanceSats)),
      feeCoveredByBlink: true,
      receiveSats: toSats(balanceSats),
      onHold,
    }
  }

  const plan = migrationDrainPlan(balanceSats)
  if (plan instanceof Error) return plan

  return {
    balanceSats: toSats(balanceSats),
    feeSats: toSats(balanceSats - plan.amount),
    feeCoveredByBlink: false,
    receiveSats: toSats(plan.amount),
    onHold,
  }
}
