import { migrationDrainAmount, reserveForAmount } from "./execute-transfer"

import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { getCustodialMigrationFlowConfig } from "@/config"

import { toSats } from "@/domain/bitcoin"

import { WalletsRepository } from "@/services/mongoose"

export const getMigrationPreview = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<MigrationPreview | ApplicationError> => {
  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) return accountWallets

  const balance = await getBalanceForWallet({ walletId: accountWallets.BTC.id })
  if (balance instanceof Error) return balance

  const balanceSats = BigInt(balance)

  if (balanceSats <= 0n) {
    return {
      balanceSats: toSats(0),
      feeSats: toSats(0),
      feeCoveredByBlink: false,
      receiveSats: toSats(0),
    }
  }

  const { deMinimisThresholdSats } = getCustodialMigrationFlowConfig()

  if (balanceSats <= BigInt(deMinimisThresholdSats)) {
    return {
      balanceSats: toSats(balanceSats),
      feeSats: toSats(reserveForAmount(balanceSats)),
      feeCoveredByBlink: true,
      receiveSats: toSats(balanceSats),
    }
  }

  const drainAmount = migrationDrainAmount(balanceSats)
  if (drainAmount instanceof Error) return drainAmount

  return {
    balanceSats: toSats(balanceSats),
    feeSats: toSats(balanceSats - drainAmount),
    feeCoveredByBlink: false,
    receiveSats: toSats(drainAmount),
  }
}
