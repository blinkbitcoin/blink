import {
  ApiKeyInvalidLimitError,
  ApiKeySpendingRecordError,
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

    case match(KnownApiKeysErrorMessages.InvalidAmountError):
      return new ApiKeySpendingRecordError(errMsg)

    case match(KnownApiKeysErrorMessages.InvalidLimitError):
      return new ApiKeyInvalidLimitError(errMsg)

    default:
      return new UnknownApiKeysServiceError(errMsg)
  }
}

export const KnownApiKeysErrorMessages = {
  InvalidApiKeyId: /Invalid API key ID/,
  InvalidAmountError: /Negative amount not allowed|Amount must be positive/,
  InvalidLimitError: /Invalid limit value/,
  DatabaseError: /Database/,
} as const
