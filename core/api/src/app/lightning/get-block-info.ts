import { LndService } from "@/services/lnd"

export const getBlockInfo = async (): Promise<ApplicationError | BlockInfo> => {
  const offChainService = LndService()
  if (offChainService instanceof Error) {
    return offChainService
  }
  return offChainService.getBlockInfo()
}
