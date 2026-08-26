import { CouldNotFindError } from "@/domain/errors"
import { DomainError, ErrorLevel, ValidationError } from "@/domain/shared"

export class BtcMapError extends DomainError {}

export class BtcMapServiceError extends BtcMapError {}

export class BtcMapNotConfiguredError extends BtcMapServiceError {}

export class BtcMapUnauthorizedError extends BtcMapServiceError {
  level = ErrorLevel.Critical
}

export class BtcMapUnavailableError extends BtcMapServiceError {
  level = ErrorLevel.Critical
}

export class BtcMapSubmitPlaceRejectedError extends BtcMapServiceError {
  level = ErrorLevel.Warn
}

export class MalformedBtcMapResponseError extends BtcMapServiceError {
  level = ErrorLevel.Critical
}

export class UnknownBtcMapServiceError extends BtcMapServiceError {
  level = ErrorLevel.Critical
}

export class InvalidBtcMapCategoryError extends ValidationError {}

export class InvalidBtcMapPlaceNameError extends ValidationError {}

export class InvalidBtcMapSubmissionIdError extends ValidationError {}

export class CouldNotFindBtcMapPlaceSubmissionError extends CouldNotFindError {}
