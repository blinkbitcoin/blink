import { createHmac } from "crypto"

import { BTCMAP_HMAC_SECRET } from "@/config"
import { AccountLevel, checkedCoordinates } from "@/domain/accounts"
import {
  BtcMapPlaceSubmissionStatus,
  checkedBtcMapCategory,
  checkedBtcMapPlaceName,
  checkedBtcMapSubmissionId,
} from "@/domain/btcmap"
import {
  BtcMapNotConfiguredError,
  CouldNotFindBtcMapPlaceSubmissionError,
} from "@/domain/btcmap/errors"
import {
  DuplicateKeyForPersistError,
  InsufficientAccountLevelError,
} from "@/domain/errors"
import { RateLimitConfig } from "@/domain/rate-limit"
import { baseLogger } from "@/services/logger"
import { BTCMAP_ORIGIN, BtcMapService } from "@/services/btcmap"
import { BtcMapPlaceSubmissionsRepository } from "@/services/mongoose"
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

  const submissions = BtcMapPlaceSubmissionsRepository()
  const existing = await submissions.findByAccountIdAndSubmissionId({
    accountId: account.id,
    submissionId: submissionIdChecked,
  })
  if (
    existing instanceof Error &&
    !(existing instanceof CouldNotFindBtcMapPlaceSubmissionError)
  ) {
    return existing
  }

  // replay of an operation we already know btcmap committed: return the
  // recorded result without consuming rate limit or re-calling upstream
  if (
    !(existing instanceof Error) &&
    existing.status === BtcMapPlaceSubmissionStatus.Submitted &&
    existing.btcMapPlaceId !== undefined
  ) {
    return { id: existing.btcMapPlaceId, origin: BTCMAP_ORIGIN, externalId }
  }

  const rateLimitConfig = RateLimitConfig.btcMapPlaceSubmitPerAccount
  const limitOk = await consumeLimiter({
    rateLimitConfig,
    keyToConsume: account.id,
  })
  if (limitOk instanceof Error) return limitOk

  const refundRateLimit = async () => {
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
  }

  // persist the pending operation before the upstream call, so an ambiguous
  // failure (upstream committed, response lost) leaves a trace the retry can
  // find — and so the upstream id is known later for get/revoke calls
  if (existing instanceof CouldNotFindBtcMapPlaceSubmissionError) {
    const persisted = await submissions.insertPending({
      accountId: account.id,
      submissionId: submissionIdChecked,
      externalId,
      lat: coordinates.latitude,
      lon: coordinates.longitude,
      category: categoryChecked,
      name: nameChecked,
    })
    if (persisted instanceof Error) {
      if (!(persisted instanceof DuplicateKeyForPersistError)) {
        await refundRateLimit()
        return persisted
      }
      // a concurrent identical request won the insert race; the externalId is
      // deterministic, so proceed — its record gets marked on success
      baseLogger.info(
        { accountId: account.id, submissionId: submissionIdChecked },
        "Concurrent btcmap place submission insert; proceeding with shared record",
      )
    }
  }

  const result = await btcMapService.submitPlace({
    externalId,
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    category: categoryChecked,
    name: nameChecked,
  })
  if (result instanceof Error) {
    // keep the record pending so a retry re-attempts the upstream call
    await refundRateLimit()
    return result
  }

  const marked = await submissions.markSubmitted({
    accountId: account.id,
    submissionId: submissionIdChecked,
    btcMapPlaceId: result.id,
    lat: coordinates.latitude,
    lon: coordinates.longitude,
    category: categoryChecked,
    name: nameChecked,
  })
  if (marked instanceof Error) {
    // the place is committed upstream — don't fail the user's operation over a
    // bookkeeping error; the record stays pending and a retry will patch it
    baseLogger.error(
      { error: marked, accountId: account.id, submissionId: submissionIdChecked },
      "Failed to mark btcmap place submission as submitted",
    )
  }

  return {
    id: result.id,
    origin: result.origin,
    externalId,
  }
}
