import { listInactiveMerchants } from "./list-inactive-merchants"
import { deleteMerchantByUsername } from "./delete-merchant-map"

export const removeInactiveMerchants = async (): Promise<void | ApplicationError> => {
  const inactiveMerchants = await listInactiveMerchants()
  if (inactiveMerchants instanceof Error) return inactiveMerchants

  for (const merchant of inactiveMerchants) {
    await deleteMerchantByUsername({ username: merchant.username })
  }
}
