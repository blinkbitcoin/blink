import { createHmac } from "crypto"

import { BTCMAP_HMAC_SECRET } from "@/config"
import { AccountLevel, checkedCoordinates } from "@/domain/accounts"
import {
  checkedBtcMapCategory,
  checkedBtcMapPlaceName,
  checkedBtcMapSubmissionId,
} from "@/domain/btcmap"
import { BtcMapNotConfiguredError } from "@/domain/btcmap/errors"
import { InsufficientAccountLevelError } from "@/domain/errors"
import { RateLimitConfig } from "@/domain/rate-limit"
import { baseLogger } from "@/services/logger"
import { BtcMapService } from "@/services/btcmap"
import { consumeLimiter, rewardLimiter } from "@/services/rate-limit"

type BtcMapSubmittedPlace = {
  id: number
  origin: string
  externalId: string
}

export const submitPlace = async ({
  account,
  submissionId,
  latitude,
  longitude,
  category,
  name,
}: {
  account: Account
  submissionId: string
  latitude: number
  longitude: number
  category: string
  name: string
}): Promise<BtcMapSubmittedPlace | ApplicationError> => {
  if (account.level < AccountLevel.Two) {
    return new InsufficientAccountLevelError()
  }

  const submissionIdChecked = checkedBtcMapSubmissionId(submissionId)
  if (submissionIdChecked instanceof Error) return submissionIdChecked

  const nameChecked = checkedBtcMapPlaceName(name)
  if (nameChecked instanceof Error) return nameChecked

  const categoryChecked = checkedBtcMapCategory(category)
  if (categoryChecked instanceof Error) return categoryChecked

  const coordinates = checkedCoordinates({ latitude, longitude })
  if (coordinates instanceof Error) return coordinates

  // check the service is configured before consuming the rate limit, so that
  // a misconfigured or unavailable btcmap instance can't burn a user's quota
  const btcMapService = BtcMapService()
  if (btcMapService instanceof Error) return btcMapService

  if (!BTCMAP_HMAC_SECRET) {
    return new BtcMapNotConfiguredError("BTCMAP_HMAC_SECRET is not set")
  }

  const rateLimitConfig = RateLimitConfig.btcMapPlaceSubmitPerAccount
  const limitOk = await consumeLimiter({
    rateLimitConfig,
    keyToConsume: account.id,
  })
  if (limitOk instanceof Error) return limitOk

  // dedicated secret (not the btcmap api token) so token rotation does not
  // change every account's external_id prefix. The suffix is the client-supplied
  // operation identity: a retried mutation reuses the same submissionId, so
  // btcmap's (origin, external_id) idempotency turns the retry into an update
  // of the original submission instead of creating a duplicate place.
  const accountHash = createHmac("sha256", BTCMAP_HMAC_SECRET)
    .update(account.id)
    .digest("hex")
    .slice(0, 16)
  const externalId = `${accountHash}:${submissionIdChecked}`

  const result = await btcMapService.submitPlace({
    externalId,
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    category: categoryChecked,
    name: nameChecked,
  })
  if (result instanceof Error) {
    // the failure is ours or upstream's, not the user's — refund the point
    const rewarded = await rewardLimiter({
      rateLimitConfig,
      keyToConsume: account.id,
    })
    if (rewarded instanceof Error) {
      baseLogger.error(
        { error: rewarded, accountId: account.id },
        "Failed to refund btcmap place submission rate limit",
      )
    }
    return result
  }

  return {
    id: result.id,
    origin: result.origin,
    externalId,
  }
}
