import { getAccountByUsername } from "."

import {
  NotificationTemplateNotFoundError,
  checkedToIconFromIconName,
  checkedToLocalizedNotificationContentsMap,
  checkedToNotificationStatus,
  checkedToOpenDeepLink,
  checkedToOpenExternalUrl,
} from "@/domain/notifications"
import { NotificationsService } from "@/services/notifications"

export const triggerNotificationTemplated = async ({
  handle,
  status,
  language,
}: TriggerAdminNotificationTemplatedArgs): Promise<ApplicationError | true> => {
  const notificationsService = NotificationsService()

  const account = await getAccountByUsername(handle)
  if (account instanceof Error) return account

  const existingMessageRes = await notificationsService.msgMessagesList({
    username: handle,
  })
  if (existingMessageRes instanceof Error) return existingMessageRes

  const messageId = existingMessageRes.items[0]?.id

  const templatesRes = await notificationsService.msgTemplatesList({
    status,
    languageCode: language,
  })
  if (templatesRes instanceof Error || templatesRes.items.length === 0)
    return new NotificationTemplateNotFoundError()

  const template = templatesRes.items[0]

  const localizedContents = checkedToLocalizedNotificationContentsMap([
    {
      title: template.title,
      body: template.body,
      language: template.languageCode,
    },
  ])
  if (localizedContents instanceof Error) return localizedContents

  const icon = checkedToIconFromIconName(template.iconName)
  if (icon instanceof Error) return icon

  const openDeepLink = checkedToOpenDeepLink({
    deeplinkScreen: template.deeplinkScreen,
    deeplinkAction: template.deeplinkAction,
  })
  if (openDeepLink instanceof Error) return openDeepLink

  const openExternalUrl = checkedToOpenExternalUrl(template.externalUrl)
  if (openExternalUrl instanceof Error) return openExternalUrl

  const triggerRes = await notificationsService.triggerMarketingNotification({
    userIds: [account.kratosUserId],
    shouldSendPush: template.shouldSendPush,
    shouldAddToHistory: template.shouldAddToHistory,
    shouldAddToBulletin: template.shouldAddToBulletin,
    openDeepLink,
    openExternalUrl,
    localizedContents,
    icon,
  })
  if (triggerRes instanceof Error) return triggerRes

  const messageStatus = checkedToNotificationStatus(status)
  if (messageStatus instanceof Error) return messageStatus

  if (!messageId) {
    const createRes = await notificationsService.msgMessageCreate({
      username: handle,
      status: messageStatus,
      sentBy: "admin",
      templateId: template.id,
    })
    return createRes instanceof Error ? createRes : true
  }

  return notificationsService.msgMessageUpdateStatus({
    id: messageId,
    status: messageStatus,
  })
}
