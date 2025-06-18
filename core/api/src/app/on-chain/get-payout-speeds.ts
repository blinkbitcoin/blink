import { OnChainService } from "@/services/bria"

export const getPayoutSpeeds = () => {
  const onchainService = OnChainService()
  return onchainService.getPayoutSpeeds()
}
