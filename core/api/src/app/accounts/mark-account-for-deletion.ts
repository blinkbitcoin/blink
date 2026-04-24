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
import { addAttributesToCurrentSpan, addEventToCurrentSpan } from "@/services/tracing"
import { getBankOwnerWalletId } from "@/services/ledger/caching"

/**
 * Marks an account for deletion, sweeping any positive wallet balances to a
 * destination account before closing.
 *
 * **Retry / idempotency**: if the function returns an error mid-sweep (e.g. a
 * payment failure on one wallet), already-swept wallets will have a zero
 * balance and will be skipped on re-invocation (`balance <= 0` guard). It is
 * safe to call this function again after a partial failure — it will pick up
 * from the first wallet that still has a positive balance.
 *
 * Note: no atomic rollback is performed. A partial failure leaves the account
 * open and some wallets already swept. Re-invoke to complete the operation.
 */
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

  addAttributesToCurrentSpan({
    "markAccountForDeletion.privilegedBypass": skipChecks,
    "markAccountForDeletion.accountId": account.id,
    "markAccountForDeletion.updatedByPrivilegedClientId":
      updatedByPrivilegedClientId ?? "unknown",
  })

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

  if (resolvedDestinationAccountId === account.id) {
    return new InvalidAccountForDeletionError(
      `Destination account cannot be the same as the account being deleted: ${account.id}`,
    )
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
    if (payment instanceof Error) return payment

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
