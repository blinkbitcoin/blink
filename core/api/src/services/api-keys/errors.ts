import {
  ApiKeyInvalidLimitError,
  ApiKeyLimitExceededError,
  ApiKeySpendingRecordError,
  InvalidApiKeyIdError,
  UnknownApiKeysServiceError,
} from "@/domain/api-keys"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

export const handleCommonApiKeysErrors = (err: Error | string | unknown) => {
  const errMsg = parseErrorMessageFromUnknown(err)

  const match = (knownErrDetail: RegExp): boolean => knownErrDetail.test(errMsg)

  switch (true) {
    case match(KnownApiKeysErrorMessages.LimitExceeded):
      return new ApiKeyLimitExceededError(errMsg)

    case match(KnownApiKeysErrorMessages.InvalidApiKeyId):
      return new InvalidApiKeyIdError(errMsg)

    case match(KnownApiKeysErrorMessages.InvalidAmountError):
    case match(KnownApiKeysErrorMessages.AmountMismatchError):
    case match(KnownApiKeysErrorMessages.MissingTransactionIdError):
    case match(KnownApiKeysErrorMessages.EphemeralNotFoundError):
      return new ApiKeySpendingRecordError(errMsg)

    case match(KnownApiKeysErrorMessages.InvalidLimitError):
      return new ApiKeyInvalidLimitError(errMsg)

    default:
      return new UnknownApiKeysServiceError(errMsg)
  }
}

export const KnownApiKeysErrorMessages = {
  LimitExceeded: /spending limit exceeded/,
  InvalidApiKeyId: /Invalid API key ID/,
  InvalidAmountError:
    /Negative amount not allowed|Amount must be positive|Invalid limit amount \(must be positive\)/,
  AmountMismatchError: /Spending amount mismatch for transaction reference/,
  MissingTransactionIdError: /Missing transaction id for ephemeral finalization/,
  EphemeralNotFoundError: /Ephemeral reservation not found:/,
  InvalidLimitError: /Invalid limit value/,
} as const
