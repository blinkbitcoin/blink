import { DomainError, ValidationError } from "@/domain/shared"

export class BtcMapError extends DomainError {}

export class BtcMapSubmitPlaceError extends BtcMapError {}

export class InvalidBtcMapCategoryError extends ValidationError {}
