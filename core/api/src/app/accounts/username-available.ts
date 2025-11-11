import { CouldNotFindUsernameError } from "@/domain/errors"
import { checkedToUsername } from "@/domain/accounts"
import { checkedToPhoneNumber } from "@/domain/users"

import { UsernameRepository } from "@/services/mongoose"

export const usernameAvailable = async (
  username: Username,
): Promise<boolean | ApplicationError> => {
  const checkedUsername = checkedToUsername(username)
  if (checkedUsername instanceof Error) {
    return false
  }

  // username can't be a valid phone number
  const phone = checkedToPhoneNumber(username)
  if (!(phone instanceof Error)) {
    return false
  }

  const usernamesRepo = UsernameRepository()
  const result = await usernamesRepo.findByHandle(checkedUsername)

  if (result instanceof CouldNotFindUsernameError) return true
  if (result instanceof Error) return result
  return false
}
