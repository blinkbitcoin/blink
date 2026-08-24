import { DomainError } from "@/domain/shared"

export class BtcMapError extends DomainError {}

export class BtcMapSubmitPlaceError extends BtcMapError {}

export class InsufficientAccountLevelError extends BtcMapError {}
