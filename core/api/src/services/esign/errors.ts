import { ErrorCodes, getErrorCode } from "@blinkbitcoin/esign-node"

import {
  ESignEnvelopeCreationError,
  ESignEnvelopeNotFoundError,
  ESignProviderUnavailableError,
  UnknownESignServiceError,
} from "@/domain/esign"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

export const handleESignErrors = (err: Error | string | unknown): ESignServiceError => {
  const errMsg = parseErrorMessageFromUnknown(err)

  switch (getErrorCode(err)) {
    case ErrorCodes.ENVELOPE_NOT_FOUND:
      return new ESignEnvelopeNotFoundError(errMsg)

    case ErrorCodes.ENVELOPE_CREATION_FAILED:
      return new ESignEnvelopeCreationError(errMsg)

    case ErrorCodes.PROVIDER_UNAVAILABLE:
      return new ESignProviderUnavailableError(errMsg)

    default:
      return new UnknownESignServiceError(errMsg)
  }
}
