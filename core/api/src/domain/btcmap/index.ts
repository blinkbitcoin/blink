import {
  InvalidBtcMapCategoryError,
  InvalidBtcMapPlaceNameError,
  InvalidBtcMapSubmissionIdError,
} from "./errors"

import { UuidRegex } from "@/domain/shared"

export const BtcMapPlaceSubmissionStatus = {
  Pending: "pending",
  Submitted: "submitted",
} as const

export const checkedBtcMapCategory = (
  category: string,
): BtcMapCategory | InvalidBtcMapCategoryError => {
  const trimmed = category.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 50 ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(trimmed)
  ) {
    return new InvalidBtcMapCategoryError()
  }
  return trimmed as BtcMapCategory
}

export const checkedBtcMapPlaceName = (
  name: string,
): BtcMapPlaceName | InvalidBtcMapPlaceNameError => {
  const trimmed = name.trim()
  if (trimmed.length < 3 || trimmed.length > 100) {
    return new InvalidBtcMapPlaceNameError()
  }
  return trimmed as BtcMapPlaceName
}

// client-generated per logical submission, reused on retry so btcmap's
// (origin, external_id) idempotency can dedupe ambiguous failures
export const checkedBtcMapSubmissionId = (
  submissionId: string,
): BtcMapSubmissionId | InvalidBtcMapSubmissionIdError => {
  if (!submissionId.match(UuidRegex)) {
    return new InvalidBtcMapSubmissionIdError()
  }
  return submissionId as BtcMapSubmissionId
}
