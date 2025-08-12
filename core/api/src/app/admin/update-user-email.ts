import { markAccountForDeletion } from "@/app/accounts"

import { AccountValidator, checkedToAccountId } from "@/domain/accounts"

import { addAttributesToCurrentSpan } from "@/services/tracing"
import { AccountsRepository } from "@/services/mongoose/accounts"
import { AuthWithEmailPasswordlessService, IdentityRepository } from "@/services/kratos"
import { checkedToEmailAddress } from "@/domain/users"

export const updateUserEmail = async ({
  accountId: accountIdRaw,
  email,
  updatedByPrivilegedClientId,
}: {
  accountId: string
  email: string
  updatedByPrivilegedClientId: PrivilegedClientId
}): Promise<Account | ApplicationError> => {
  const checkedEmail = checkedToEmailAddress(email)
  if (checkedEmail instanceof Error) return checkedEmail

  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const accountsRepo = AccountsRepository()
  const account = await accountsRepo.findById(accountId)
  if (account instanceof Error) return account
  const accountValidator = AccountValidator(account)
  if (accountValidator instanceof Error) return accountValidator
  const kratosUserId = account.kratosUserId

  const identities = IdentityRepository()
  const existingUserId = await identities.getUserIdFromIdentifier(checkedEmail)
  if (!(existingUserId instanceof Error)) {
    // if an user exists with the same email,
    // then we need to delete it (only if balance is 0)
    addAttributesToCurrentSpan({ existingUser: true })

    const newAccount = await accountsRepo.findByUserId(existingUserId)
    if (newAccount instanceof Error) return newAccount

    const result = await markAccountForDeletion({
      accountId: newAccount.id,
      cancelIfPositiveBalance: true,
      bypassMaxDeletions: true,
      updatedByPrivilegedClientId,
    })
    if (result instanceof Error) return result
  }

  const authService = AuthWithEmailPasswordlessService()
  const kratosResult = await authService.updateEmail({
    kratosUserId,
    email: checkedEmail,
  })
  if (kratosResult instanceof Error) return kratosResult

  return account
}
