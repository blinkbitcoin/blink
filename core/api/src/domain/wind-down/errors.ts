import { DomainError } from "@/domain/shared"

export class WindDownError extends DomainError {}

export class ReceiveDisabledError extends WindDownError {}
