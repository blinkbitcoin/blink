import { isAxiosError } from "axios"

import {
  BtcMapUnauthorizedError,
  BtcMapUnavailableError,
  UnknownBtcMapServiceError,
} from "@/domain/btcmap/errors"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

export const handleBtcMapErrors = (err: Error | string | unknown) => {
  if (isAxiosError(err)) {
    const status = err.response?.status

    if (status === 401 || status === 403) {
      return new BtcMapUnauthorizedError(err.message)
    }

    if (status === undefined || status >= 500) {
      return new BtcMapUnavailableError(err.message)
    }

    return new UnknownBtcMapServiceError(err.message)
  }

  return new UnknownBtcMapServiceError(parseErrorMessageFromUnknown(err))
}
