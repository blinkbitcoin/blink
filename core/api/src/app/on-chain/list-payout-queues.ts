import { OnChainService } from "@/services/bria"

export const listPayoutQueues = (): Promise<PayoutQueue[] | ApplicationError> => {
  const onchainService = OnChainService()
  return onchainService.listPayoutQueues()
}
