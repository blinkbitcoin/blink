import { createHmac, randomUUID } from "crypto"

import { BTCMAP_API_TOKEN } from "@/config"
import { AccountLevel, checkedCoordinates, checkedMapTitle } from "@/domain/accounts"
import { checkedBtcMapCategory } from "@/domain/btcmap"
import { InsufficientAccountLevelError } from "@/domain/errors"
import { RateLimitConfig } from "@/domain/rate-limit"
import { consumeLimiter } from "@/services/rate-limit"
import * as BtcMapService from "@/services/btcmap"

type BtcMapSubmittedPlace = {
  id: number
  origin: string
  externalId: string
}

export const submitPlace = async ({
  account,
  latitude,
  longitude,
  category,
  name,
}: {
  account: Account
  latitude: number
  longitude: number
  category: string
  name: string
}): Promise<BtcMapSubmittedPlace | ApplicationError> => {
  if (account.level < AccountLevel.Two) {
    return new InsufficientAccountLevelError()
  }

  const nameChecked = checkedMapTitle(name)
  if (nameChecked instanceof Error) return nameChecked

  const categoryChecked = checkedBtcMapCategory(category)
  if (categoryChecked instanceof Error) return categoryChecked

  const coordinates = checkedCoordinates({ latitude, longitude })
  if (coordinates instanceof Error) return coordinates

  const limitOk = await consumeLimiter({
    rateLimitConfig: RateLimitConfig.btcMapPlaceSubmitPerAccount,
    keyToConsume: account.id,
  })
  if (limitOk instanceof Error) return limitOk

  const accountHash = createHmac("sha256", BTCMAP_API_TOKEN || "")
    .update(account.id)
    .digest("hex")
    .slice(0, 16)
  const externalId = `${accountHash}:${randomUUID()}`

  const result = await BtcMapService.submitPlace({
    externalId,
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    category: categoryChecked,
    name: nameChecked,
  })
  if (result instanceof Error) return result

  return {
    id: result.id,
    origin: result.origin,
    externalId,
  }
}
