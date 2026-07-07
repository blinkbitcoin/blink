import { getCustodialMigrationFlowConfig } from "@/config"

import { getBalanceForWallet } from "@/app/wallets/get-balance-for-wallet"

import { AccountValidator } from "@/domain/accounts"
import { CouldNotFindMigrationFlowStateError } from "@/domain/errors"
import {
  MigrationDollarBalanceNotEmptyError,
  MigrationFlowDisabledError,
  MigrationFlowPhase,
} from "@/domain/migration-flow"

import {
  AccountsRepository,
  MigrationFlowStateRepository,
  WalletsRepository,
} from "@/services/mongoose"

export const startMigrationFlow = async ({
  accountId,
}: {
  accountId: AccountId
}): Promise<MigrationFlow | ApplicationError> => {
  if (!getCustodialMigrationFlowConfig().enabled) {
    return new MigrationFlowDisabledError()
  }

  const account = await AccountsRepository().findById(accountId)
  if (account instanceof Error) return account

  const accountValidator = AccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator

  const migrationFlowRepo = MigrationFlowStateRepository()

  const existing = await migrationFlowRepo.findByAccountId(accountId)
  if (!(existing instanceof CouldNotFindMigrationFlowStateError)) return existing

  const accountWallets =
    await WalletsRepository().findAccountWalletsByAccountId(accountId)
  if (accountWallets instanceof Error) return accountWallets

  const usdBalance = await getBalanceForWallet({ walletId: accountWallets.USD.id })
  if (usdBalance instanceof Error) return usdBalance
  if (usdBalance > 0) {
    return new MigrationDollarBalanceNotEmptyError(
      `Dollar balance must be empty before migration. walletId: ${accountWallets.USD.id}, balance: ${usdBalance}`,
    )
  }

  return migrationFlowRepo.upsertByAccountId({
    accountId,
    phase: MigrationFlowPhase.InProgress,
  })
}
