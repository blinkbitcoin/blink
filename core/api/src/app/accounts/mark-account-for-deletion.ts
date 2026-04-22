import { getDefaultAccountsConfig } from "@/config"

import { intraledgerPaymentSendWalletId } from "@/app/payments"
import { deleteMerchantByUsername } from "@/app/merchants"
import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"

import {
  AccountStatus,
  AccountValidator,
  InvalidAccountForDeletionError,
} from "@/domain/accounts"
import { AccountHasPositiveBalanceError } from "@/domain/authentication/errors"

import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { IdentityRepository } from "@/services/kratos"
import { addEventToCurrentSpan } from "@/services/tracing"
import { getBankOwnerWalletId } from "@/services/ledger/caching"

export const markAccountForDeletion = async ({
  accountId,
  // skipChecks is a privileged admin-only flag. When true it bypasses account
  // status validation (allowing deletion of locked/inactive accounts) and
  // spending limits on the balance sweep payment. Must never be set by
  // end-user-facing code paths.
  skipChecks = false,
  updatedByPrivilegedClientId,
  bypassMaxDeletions = false,
  destinationAccountId,
}: {
  accountId: AccountId
  skipChecks?: boolean
  updatedByPrivilegedClientId?: PrivilegedClientId
  bypassMaxDeletions?: boolean
  destinationAccountId?: AccountId
}): Promise<true | ApplicationError> => {
  const accountsRepo = AccountsRepository()
  const account = await accountsRepo.findById(accountId)
  if (account instanceof Error) return account

  const accountValidator = AccountValidator(account, { skipChecks })
  if (accountValidator instanceof Error) return accountValidator

  const wallets = await listWalletsByAccountId(account.id)
  if (wallets instanceof Error) return wallets

  let resolvedDestinationAccountId = destinationAccountId
  if (!resolvedDestinationAccountId) {
    const bankOwnerWalletId = await getBankOwnerWalletId()
    const bankOwnerWallet = await WalletsRepository().findById(bankOwnerWalletId)
    if (bankOwnerWallet instanceof Error) return bankOwnerWallet
    resolvedDestinationAccountId = bankOwnerWallet.accountId
  }

  const destinationAccount = await accountsRepo.findById(resolvedDestinationAccountId)
  if (destinationAccount instanceof Error) return destinationAccount

  const destinationWallets = await listWalletsByAccountId(resolvedDestinationAccountId)
  if (destinationWallets instanceof Error) return destinationWallets

  const destinationWalletByCurrency = new Map(
    destinationWallets.map((w) => [w.currency, w.id] as [WalletCurrency, WalletId]),
  )

  for (const wallet of wallets) {
    const balance = await getBalanceForWallet({ walletId: wallet.id })
    if (balance instanceof Error) return balance

    // Wallets with zero or negative balance are skipped. Negative balances
    // (e.g. overdrafts) are not swept — they remain as ledger entries and are
    // handled separately by the operator if needed.
    if (balance <= 0) continue

    if (!skipChecks) {
      return new AccountHasPositiveBalanceError(
        `Cannot delete account with non-empty wallet. walletId: ${wallet.id}, balance: ${balance}, accountId: ${account.id}`,
      )
    }

    const recipientWalletId =
      destinationWalletByCurrency.get(wallet.currency) ||
      destinationAccount.defaultWalletId

    const payment = await intraledgerPaymentSendWalletId({
      senderAccount: account,
      senderWalletId: wallet.id,
      recipientWalletId,
      amount: balance,
      memo: `Closing settlement: ${wallet.currency} balance payout for Account ${account.id}`,
      skipChecks: true,
    })

    if (payment instanceof Error) {
      return new InvalidAccountForDeletionError(
        `Failed to sweep ${wallet.currency} wallet ${wallet.id} (balance: ${balance}) to destination account ${destinationAccount.id}: ${payment.message}`,
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

  if (account.username) {
    await deleteMerchantByUsername({ username: account.username })
  }

  const newAccount = await accountsRepo.update(account)
  if (newAccount instanceof Error) return newAccount

  const identities = IdentityRepository()
  const deletionResult = await identities.deleteIdentity(kratosUserId)
  if (deletionResult instanceof Error) return deletionResult

  return true
}
