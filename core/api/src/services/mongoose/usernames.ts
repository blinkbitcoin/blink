import { parseRepositoryError } from "./utils"

import { Usernames } from "@/services/mongoose/schema"
import {
  CouldNotFindUsernameError,
  CouldNotUpdateUsernameError,
  RepositoryError,
} from "@/domain/errors"

export const UsernameRepository = (): IUsernamesRepository => {
  const findByHandle = async (handle: string): Promise<Usernames | RepositoryError> => {
    try {
      const result = await Usernames.findOne({ handle }).collation({
        locale: "en",
        strength: 2,
      })
      if (!result) return new CouldNotFindUsernameError(handle)

      return usernameFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const findDefaultByAccountId = async (
    accountId: AccountId,
  ): Promise<Usernames | RepositoryError> => {
    try {
      const result = await Usernames.findOne({ accountId, isDefault: true })
      if (!result) return new CouldNotFindUsernameError("default username")

      return usernameFromRaw(result)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const listByAccountId = async (
    accountId: AccountId,
  ): Promise<Usernames[] | RepositoryError> => {
    try {
      const results = await Usernames.find({ accountId })
      return results.map(usernameFromRaw)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  const update = async (input: UsernamesInput): Promise<Usernames | RepositoryError> => {
    try {
      const updated = await Usernames.findOneAndUpdate(
        { accountId: input.accountId, isDefault: true },
        {
          ...input,
          updatedAt: new Date(),
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      )
      if (!updated) return new CouldNotUpdateUsernameError()

      return usernameFromRaw(updated)
    } catch (err) {
      return parseRepositoryError(err)
    }
  }

  return {
    findByHandle,
    listByAccountId,
    findDefaultByAccountId,
    update,
  }
}

const usernameFromRaw = (doc: UsernamesRecord): Usernames => ({
  accountId: doc.accountId as AccountId,
  walletId: doc.walletId as WalletId,
  handle: doc.handle as Username,
  isDefault: doc.isDefault,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
})
