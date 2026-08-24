import { randomUUID } from "crypto"

import { AccountLevel, checkedCoordinates } from "@/domain/accounts"
import { InsufficientAccountLevelError } from "@/domain/btcmap/errors"
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
  extraFields,
}: {
  account: Account
  latitude: number
  longitude: number
  category: string
  name: string
  extraFields?: Record<string, unknown>
}): Promise<BtcMapSubmittedPlace | ApplicationError> => {
  if (account.level < AccountLevel.Two) {
    return new InsufficientAccountLevelError()
  }

  const coordinates = checkedCoordinates({ latitude, longitude })
  if (coordinates instanceof Error) return coordinates

  const externalId = `${account.id}:${randomUUID()}`

  const result = await BtcMapService.submitPlace({
    externalId,
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    category,
    name,
    extraFields,
  })
  if (result instanceof Error) return result

  return {
    id: result.id,
    origin: result.origin,
    externalId: result.external_id,
  }
}
