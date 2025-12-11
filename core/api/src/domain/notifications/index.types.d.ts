type NotificationsError = import("./errors").NotificationsError
type NotificationsServiceError = import("./errors").NotificationsServiceError

type NotificationType =
  (typeof import("./index").NotificationType)[keyof typeof import("./index").NotificationType]

type SendBalanceArgs = {
  balanceAmount: BalanceAmount<WalletCurrency>
  recipientUserId: UserId
  displayBalanceAmount?: DisplayAmount<DisplayCurrency>
}

type PriceCurrencyArg<T extends DisplayCurrency> = PriceCurrency & {
  readonly code: T
}
type NotificationCategory =
  (typeof import("./index").NotificationCategory)[keyof typeof import("./index").NotificationCategory]

type PriceUpdateArgs<C extends DisplayCurrency> = {
  pricePerSat: RealTimePrice<C>
  pricePerUsdCent: RealTimePrice<C>
  currency: PriceCurrencyArg<C>
}

type NotificationChannel =
  (typeof import("./index").NotificationChannel)[keyof typeof import("./index").NotificationChannel]

type NotificationSettings = Record<NotificationChannel, NotificationChannelSettings> & {
  language: UserLanguageOrEmpty
  pushDeviceTokens: DeviceToken[]
}

type NotificationChannelSettings = {
  enabled: boolean
  disabledCategories: NotificationCategory[]
}

type NotificationRecipient = {
  accountId: AccountId
  userId: UserId
  walletId: WalletId
  level: AccountLevel
  status: AccountStatus
  phoneNumber?: PhoneNumber
}

type NotificatioSendTransactionArgs = {
  recipient: NotificationRecipient
  transaction: WalletTransaction
}
type SendPushNotificationArgs = {
  title: string
  body: string
  data?: { [key: string]: string }
  userId: UserId
}

type SendFilteredPushNotificationArgs = {
  title: string
  body: string
  data?: { [key: string]: string }
  userId: UserId
  notificationCategory: NotificationCategory
}

type DeepLinkScreen =
  (typeof import("./index").DeepLinkScreen)[keyof typeof import("./index").DeepLinkScreen]

type DeepLinkAction =
  (typeof import("./index").DeepLinkAction)[keyof typeof import("./index").DeepLinkAction]

type Icon = (typeof import("./index").Icon)[keyof typeof import("./index").Icon]

type LocalizedNotificationTitle = string & { readonly brand: unique symbol }

type LocalizedNotificationBody = string & { readonly brand: unique symbol }

type LocalizedNotificationContent = {
  title: LocalizedNotificationTitle
  body: LocalizedNotificationBody
  language: UserLanguage
}

type MsgMessageStatus = "pending" | "accepted" | "revoked"

type MsgTemplate = {
  id: string
  name: string
  languageCode: string
  iconName: string
  title: string
  body: string
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
}

type MsgMessage = {
  id: string
  username: string
  status: MsgMessageStatus
  sentBy: string
  updatedAt: number
}

interface INotificationsService {
  sendTransaction: (
    args: NotificatioSendTransactionArgs,
  ) => Promise<true | NotificationsServiceError>
  priceUpdate: <C extends DisplayCurrency>(args: PriceUpdateArgs<C>) => void

  getUserNotificationSettings(
    userId: UserId,
  ): Promise<NotificationSettings | NotificationsServiceError>

  updateUserLanguage(args: {
    userId: UserId
    language: UserLanguageOrEmpty
  }): Promise<NotificationSettings | NotificationsServiceError>

  enableNotificationChannel(args: {
    userId: UserId
    notificationChannel: NotificationChannel
  }): Promise<NotificationSettings | NotificationsServiceError>

  disableNotificationChannel(args: {
    userId: UserId
    notificationChannel: NotificationChannel
  }): Promise<NotificationSettings | NotificationsServiceError>

  enableNotificationCategory(args: {
    userId: UserId
    notificationChannel: NotificationChannel
    notificationCategory: NotificationCategory
  }): Promise<NotificationSettings | NotificationsServiceError>

  disableNotificationCategory(args: {
    userId: UserId
    notificationChannel: NotificationChannel
    notificationCategory: NotificationCategory
  }): Promise<NotificationSettings | NotificationsServiceError>

  addPushDeviceToken(args: {
    userId: UserId
    deviceToken: DeviceToken
  }): Promise<NotificationSettings | NotificationsServiceError>

  removePushDeviceToken(args: {
    userId: UserId
    deviceToken: DeviceToken
  }): Promise<NotificationSettings | NotificationsServiceError>

  updateEmailAddress(args: {
    userId: UserId
    email: EmailAddress
  }): Promise<true | NotificationsServiceError>

  removeEmailAddress(args: { userId: UserId }): Promise<true | NotificationsServiceError>

  triggerMarketingNotification(
    args: TriggerMarketingNotificationArgs,
  ): Promise<true | NotificationsServiceError>

  msgTemplateCreate(args: {
    name: string
    languageCode: string
    iconName: string
    title: string
    body: string
    shouldSendPush?: boolean
    shouldAddToHistory?: boolean
    shouldAddToBulletin?: boolean
  }): Promise<true | NotificationsServiceError>

  msgTemplateUpdate(args: {
    id: string
    name: string
    languageCode: string
    iconName: string
    title: string
    body: string
    shouldSendPush?: boolean
    shouldAddToHistory?: boolean
    shouldAddToBulletin?: boolean
  }): Promise<true | NotificationsServiceError>

  msgTemplateDelete(args: { id: string }): Promise<true | NotificationsServiceError>

  msgTemplatesList(args: {
    languageCode?: string
    limit?: number
    offset?: number
  }): Promise<MsgTemplate[] | NotificationsServiceError>

  msgMessageCreate(args: {
    username: string
    status?: MsgMessageStatus | string
    sentBy: string
  }): Promise<true | NotificationsServiceError>

  msgMessageUpdateStatus(args: {
    id: string
    status: MsgMessageStatus | string
  }): Promise<true | NotificationsServiceError>

  msgMessagesList(args: {
    limit?: number
    offset?: number
  }): Promise<MsgMessage[] | NotificationsServiceError>
}

type TriggerMarketingNotificationArgs = {
  userIds: UserId[]
  openDeepLink:
    | {
        screen: DeepLinkScreen | undefined
        action: DeepLinkAction | undefined
      }
    | undefined
  openExternalUrl:
    | {
        url: string
      }
    | undefined
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
  icon?: Icon
  localizedContents: Map<UserLanguage, LocalizedNotificationContent>
}
