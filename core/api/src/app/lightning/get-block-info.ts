import { getWalletInfo } from "lightning"

import { getActiveLnd } from "@/services/lnd/config"

export const getBlockInfo = async (): Promise<ApplicationError | BlockInfo> => {
  const lndConnect = getActiveLnd()
  if (lndConnect instanceof Error) {
    return lndConnect
  }
  const info = await getWalletInfo({ lnd: lndConnect.lnd })
  return {
    blockHeight: info.current_block_height as BlockHeight,
    blockHash: info.current_block_hash as BlockHash,
  }
}
