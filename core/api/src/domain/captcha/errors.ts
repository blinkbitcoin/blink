import { DomainError, ErrorLevel } from "@/domain/shared"

export class CaptchaError extends DomainError {}

export class CaptchaUserFailToPassError extends CaptchaError {}
// The geetest bypass-status endpoint is unreachable or reports degraded. We fail
// closed rather than serving an offline challenge we would later have to reject.
// Warn, not Critical: the probe/transport recording in sendRequest already
// carries the outage signal, and a per-request Critical would page once per
// login-screen load for the duration of a geetest outage.
export class CaptchaServiceUnavailableError extends CaptchaError {
  level = ErrorLevel.Warn
}
export class UnknownCaptchaError extends CaptchaError {
  level = ErrorLevel.Critical
}
