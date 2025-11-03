import {
  ApiKeysServiceUnreachableError,
  InvalidApiKeyIdError,
  UnknownApiKeysServiceError,
} from "@/domain/api-keys"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

export const handleCommonApiKeysErrors = (err: Error | string | unknown) => {
  const errMsg = parseErrorMessageFromUnknown(err)

  const match = (knownErrDetail: RegExp): boolean => knownErrDetail.test(errMsg)

  switch (true) {
    case match(KnownApiKeysErrorMessages.InvalidApiKeyId):
      return new InvalidApiKeyIdError(errMsg)

    case match(KnownApiKeysErrorMessages.NoConnectionError):
      return new ApiKeysServiceUnreachableError(errMsg)

    default:
      return new UnknownApiKeysServiceError(errMsg)
  }
}

export const KnownApiKeysErrorMessages = {
  InvalidApiKeyId: /Invalid API key ID/,
  NoConnectionError: /UNAVAILABLE: No connection established/,
} as const
