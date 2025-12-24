import { DomainError, ErrorLevel, ValidationError } from "@/domain/shared"

export class InvalidNotificationTitleError extends ValidationError {}
export class InvalidNotificationBodyError extends ValidationError {}
export class DuplicateLocalizedNotificationContentError extends ValidationError {}

export class NotificationsError extends DomainError {}

export class NotificationsServiceError extends NotificationsError {}
export class InvalidDeviceNotificationsServiceError extends NotificationsServiceError {}
export class ConcurrentModificationNotificationsServiceError extends NotificationsServiceError {}
export class DeviceTokensNotRegisteredNotificationsServiceError extends NotificationsServiceError {
  tokens: DeviceToken[]
  constructor(tokens: DeviceToken[], message?: string | unknown | Error) {
    super(message)
    this.tokens = tokens
  }
}
export class NotificationsServiceUnreachableServerError extends NotificationsServiceError {
  level = ErrorLevel.Critical
}
export class UnknownNotificationsServiceError extends NotificationsError {
  level = ErrorLevel.Critical
}

export class InvalidPushNotificationSettingError extends NotificationsError {}

export class InvalidNotificationCategoryError extends NotificationsError {}

export class NotificationTemplateNotFoundError extends NotificationsError {}
export class InvalidNotificationStatusError extends ValidationError {}
export class InvalidNotificationIconError extends ValidationError {}
export class InvalidNotificationDeepLinkScreenError extends ValidationError {}
export class InvalidNotificationDeepLinkActionError extends ValidationError {}
export class InvalidNotificationExternalUrlError extends ValidationError {}
