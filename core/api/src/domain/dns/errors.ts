import { DomainError } from "@/domain/shared"

export class DnsError extends DomainError {}

export class DnsServiceError extends DnsError {}

export class DnsLookupError extends DnsServiceError {}
