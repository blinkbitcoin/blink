import { MerchantsRepository } from "@/services/mongoose"
import { CouldNotFindError } from "@/domain/errors"

export const isValidatedMerchant = async ({
  account,
}: {
  account: Account
}): Promise<boolean | ApplicationError> => {
  if (!account.username) {
    return false
  }

  const merchants = await MerchantsRepository().findByUsername(account.username)
  if (merchants instanceof CouldNotFindError) {
    return false
  }
  if (merchants instanceof Error) {
    return merchants
  }

  return merchants.some((merchant) => merchant.validated)
}
