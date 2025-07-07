import { checkedToUsername } from "@/domain/accounts"
import { MerchantsRepository } from "@/services/mongoose"

export const deleteMerchantById = async ({
  id,
  deletedByPrivilegedClientId,
}: {
  id: MerchantId
  deletedByPrivilegedClientId?: PrivilegedClientId
}): Promise<true | ApplicationError> => {
  const merchantsRepo = MerchantsRepository()

  const result = await merchantsRepo.remove({ id, deletedByPrivilegedClientId })
  if (result instanceof Error) return result

  return true
}

export const deleteMerchantByUsername = async ({
  username,
  deletedByPrivilegedClientId,
}: {
  username: string
  deletedByPrivilegedClientId?: PrivilegedClientId
}): Promise<true | ApplicationError> => {
  const merchantsRepo = MerchantsRepository()

  const usernameChecked = checkedToUsername(username)
  if (usernameChecked instanceof Error) return usernameChecked

  const merchants = await merchantsRepo.findByUsername(usernameChecked)
  if (merchants instanceof Error) return merchants

  if (merchants.length === 0) return true

  for (const merchant of merchants) {
    const result = await merchantsRepo.remove({
      id: merchant.id,
      deletedByPrivilegedClientId,
    })
    if (result instanceof Error) return result
  }

  return true
}
