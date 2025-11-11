import { UsernameRepository, AccountsRepository } from "@/services/mongoose"
import { CouldNotFindAccountFromUsernameError } from "@/domain/errors"

export const getAccountForUsername = async (
  username: string,
): Promise<Account | ApplicationError> => {
  const usernameRecord = await UsernameRepository().findByHandle(username)
  if (usernameRecord instanceof Error) return usernameRecord

  const account = await AccountsRepository().findById(usernameRecord.accountId)
  if (account instanceof Error) return new CouldNotFindAccountFromUsernameError(username)

  return account
}
