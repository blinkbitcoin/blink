import { getDefaultAccountsConfig } from "@/config"

import { deleteMerchantByUsername } from "@/app/merchants"

import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"

import { AccountStatus, InvalidAccountForDeletionError } from "@/domain/accounts"
import { AccountHasPositiveBalanceError } from "@/domain/authentication/errors"
import { CouldNotFindError, InactiveAccountError } from "@/domain/errors"
import {
  MigrationFlowPhase,
  MigrationLnAddressTransferStatus,
  MigrationStateConflictError,
} from "@/domain/migration-flow"

import { IdentityRepository } from "@/services/kratos"
import { addEventToCurrentSpan } from "@/services/tracing"
import {
  AccountsRepository,
  MigrationFlowStateRepository,
  UsersRepository,
} from "@/services/mongoose"

const ALLOWED_STATUSES: AccountStatus[] = [
  AccountStatus.Active,
  AccountStatus.Invited,
  AccountStatus.Migrated,
]

export const markAccountForDeletion = async ({
  accountId,
  cancelIfPositiveBalance = false,
  updatedByPrivilegedClientId,
  bypassMaxDeletions = false,
}: {
  accountId: AccountId
  cancelIfPositiveBalance?: boolean
  updatedByPrivilegedClientId?: PrivilegedClientId
  bypassMaxDeletions?: boolean
}): Promise<true | ApplicationError> => {
  const accountsRepo = AccountsRepository()
  const account = await accountsRepo.findById(accountId)
  if (account instanceof Error) return account
  if (!ALLOWED_STATUSES.includes(account.status)) {
    return new InactiveAccountError(account.id)
  }

  const flow = await MigrationFlowStateRepository().findByAccountId(accountId)
  if (flow instanceof Error && !(flow instanceof CouldNotFindError)) return flow
  if (!(flow instanceof Error) && flow.phase === MigrationFlowPhase.Transferring) {
    return new MigrationStateConflictError(
      "account deletion is unavailable while a migration transfer is in flight",
    )
  }

  const keepMerchant =
    account.username !== undefined &&
    !(flow instanceof Error) &&
    usernameTransferredToSpark({ flow, username: account.username })

  const wallets = await listWalletsByAccountId(account.id)
  if (wallets instanceof Error) return wallets

  for (const wallet of wallets) {
    const balance = await getBalanceForWallet({ walletId: wallet.id })
    if (balance instanceof Error) return balance
    if (balance > 0 && cancelIfPositiveBalance) {
      return new AccountHasPositiveBalanceError(
        `The new phone is associated with an account with a non empty wallet. walletId: ${wallet.id}, balance: ${balance}, accountId: ${account.id}, cancelIfPositiveBalance: ${cancelIfPositiveBalance}`,
      )
    }
    addEventToCurrentSpan(`deleting_wallet`, {
      walletId: wallet.id,
      currency: wallet.currency,
      balance,
    })
  }

  const { kratosUserId } = account
  const { maxDeletions } = getDefaultAccountsConfig()

  const usersRepo = UsersRepository()
  const user = await usersRepo.findById(kratosUserId)
  if (user instanceof Error) return user

  const deletedPhones: PhoneNumber[] = user.phone ? [user.phone] : []
  if (user.deletedPhones) {
    deletedPhones.push(...user.deletedPhones)
  }
  if (deletedPhones.length > 0 && !bypassMaxDeletions) {
    const usersByPhones = await usersRepo.findByDeletedPhones(deletedPhones)
    if (usersByPhones instanceof Error) return usersByPhones
    if (usersByPhones.length >= maxDeletions) return new InvalidAccountForDeletionError()
  }

  if (user.phone) {
    const newUser = {
      ...user,
      deletedPhones: user.deletedPhones
        ? [...user.deletedPhones, user.phone]
        : [user.phone],
      phone: undefined,
    }
    const result = await usersRepo.update(newUser)
    if (result instanceof Error) return result
  }

  account.statusHistory = (account.statusHistory ?? []).concat({
    status: AccountStatus.Closed,
    updatedByPrivilegedClientId,
  })

  if (account.username && !keepMerchant) {
    await deleteMerchantByUsername({ username: account.username })
  }

  const newAccount = await accountsRepo.update(account)
  if (newAccount instanceof Error) return newAccount

  const identities = IdentityRepository()
  const deletionResult = await identities.deleteIdentity(kratosUserId)
  if (deletionResult instanceof Error) return deletionResult

  return true
}

const usernameTransferredToSpark = ({
  flow,
  username,
}: {
  flow: MigrationFlow
  username: Username
}): boolean => {
  const successPrefixes = [
    `${username}: ${MigrationLnAddressTransferStatus.Transferred}`,
    `${username}: ${MigrationLnAddressTransferStatus.AlreadyTransferred}`,
  ]
  return flow.steps.some(({ step, detail }) => {
    if (step !== "ln-address-transfer" || detail === undefined) return false
    return successPrefixes.some((prefix) => detail.startsWith(prefix))
  })
}
