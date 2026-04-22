import { getDefaultAccountsConfig } from "@/config"

import { deleteMerchantByUsername } from "@/app/merchants"

import { getBalanceForWallet, listWalletsByAccountId } from "@/app/wallets"

import { intraledgerPaymentSendWalletId } from "@/app/payments"

import {
  AccountStatus,
  AccountValidator,
  InvalidAccountForDeletionError,
} from "@/domain/accounts"
import { AccountHasPositiveBalanceError } from "@/domain/authentication/errors"

import { IdentityRepository } from "@/services/kratos"
import { addEventToCurrentSpan } from "@/services/tracing"
import { AccountsRepository, UsersRepository } from "@/services/mongoose"

export const markAccountForDeletion = async ({
  accountId,
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

  for (const wallet of wallets) {
    const balance = await getBalanceForWallet({ walletId: wallet.id })
    if (balance instanceof Error) return balance
    if (balance > 0 && !skipChecks) {
      return new AccountHasPositiveBalanceError(
        `The new phone is associated with an account with a non empty wallet. walletId: ${wallet.id}, balance: ${balance}, accountId: ${account.id}`,
      )
    }

    const destinationWallets = await listWalletsByAccountId(account.id)
    if (destinationWallets instanceof Error) return destinationWallets

    if (balance > 0 && destinationAccountId) {
      const destinationAccount = await accountsRepo.findById(destinationAccountId)
      if (destinationAccount instanceof Error) return destinationAccount

      const payment = await intraledgerPaymentSendWalletId({
        senderWalletId: wallet.id,
        recipientWalletId: destinationAccount.defaultWalletId,
        amount: balance,
        memo: `Closing settlement: ${wallet.currency} balance payout for Account ${account.id}`,
        senderAccount: account,
        skipChecks: true,
      })
      if (payment instanceof Error) return payment
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
