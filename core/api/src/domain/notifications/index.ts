export * from "./errors"
import { checkedToNonEmptyLanguage } from "../users"

import {
  InvalidNotificationBodyError,
  InvalidNotificationCategoryError,
  InvalidNotificationTitleError,
  DuplicateLocalizedNotificationContentError,
  InvalidNotificationStatusError,
  InvalidNotificationIconError,
  InvalidNotificationDeepLinkScreenError,
  InvalidNotificationDeepLinkActionError,
  InvalidNotificationExternalUrlError,
} from "./errors"

export const NotificationType = {
  IntraLedgerReceipt: "intra_ledger_receipt",
  IntraLedgerPayment: "intra_ledger_payment",
  OnchainReceipt: "onchain_receipt",
  OnchainReceiptPending: "onchain_receipt_pending",
  OnchainPayment: "onchain_payment",
  LigtningReceipt: "paid-invoice",
  LigtningPayment: "lightning_payment",
} as const

export const NotificationCategory = {
  Payments: "Payments",
  Circles: "Circles",
  Price: "Price",
  AdminNotification: "AdminNotification",
  Marketing: "Marketing",
} as const

export const checkedToNotificationCategory = (
  notificationCategory: string,
): NotificationCategory | ValidationError => {
  // TODO: add validation
  if (
    !notificationCategory ||
    !Object.values(NotificationCategory).find(
      (category) => category === notificationCategory,
    )
  ) {
    return new InvalidNotificationCategoryError(
      `Invalid notification category: ${notificationCategory}`,
    )
  }

  return notificationCategory as NotificationCategory
}

export const NotificationChannel = {
  Push: "push",
} as const

export const DeepLinkScreen = {
  Circles: "Circles",
  Price: "Price",
  Earn: "Earn",
  Map: "Map",
  People: "People",
  Home: "Home",
  Receive: "Receive",
  Convert: "Convert",
  ScanQR: "ScanQR",
  Chat: "Chat",
  Settings: "Settings",
  Settings2FA: "Settings2FA",
  SettingsDisplayCurrency: "SettingsDisplayCurrency",
  SettingsDefaultAccount: "SettingsDefaultAccount",
  SettingsLanguage: "SettingsLanguage",
  SettingsTheme: "SettingsTheme",
  SettingsSecurity: "SettingsSecurity",
  SettingsAccount: "SettingsAccount",
  SettingsTxLimits: "SettingsTxLimits",
  SettingsNotifications: "SettingsNotifications",
  SettingsEmail: "SettingsEmail",
  WelcomeCard: "WelcomeCard",
  LoadingCard: "LoadingCard",
  VisaCard: "VisaCard",
  CreditCardLimit: "CreditCardLimit",
} as const

export const DeepLinkScreenNameToDeepLinkScreen: Record<string, DeepLinkScreen> = {
  CIRCLES: DeepLinkScreen.Circles,
  PRICE: DeepLinkScreen.Price,
  EARN: DeepLinkScreen.Earn,
  MAP: DeepLinkScreen.Map,
  PEOPLE: DeepLinkScreen.People,
  HOME: DeepLinkScreen.Home,
  RECEIVE: DeepLinkScreen.Receive,
  CONVERT: DeepLinkScreen.Convert,
  SCAN_QR: DeepLinkScreen.ScanQR,
  CHAT: DeepLinkScreen.Chat,
  SETTINGS: DeepLinkScreen.Settings,
  SETTINGS_2FA: DeepLinkScreen.Settings2FA,
  SETTINGS_DISPLAY_CURRENCY: DeepLinkScreen.SettingsDisplayCurrency,
  SETTINGS_DEFAULT_ACCOUNT: DeepLinkScreen.SettingsDefaultAccount,
  SETTINGS_LANGUAGE: DeepLinkScreen.SettingsLanguage,
  SETTINGS_THEME: DeepLinkScreen.SettingsTheme,
  SETTINGS_SECURITY: DeepLinkScreen.SettingsSecurity,
  SETTINGS_ACCOUNT: DeepLinkScreen.SettingsAccount,
  SETTINGS_TX_LIMITS: DeepLinkScreen.SettingsTxLimits,
  SETTINGS_NOTIFICATIONS: DeepLinkScreen.SettingsNotifications,
  SETTINGS_EMAIL: DeepLinkScreen.SettingsEmail,
  WELCOME_CARD: DeepLinkScreen.WelcomeCard,
  LOADING_CARD: DeepLinkScreen.LoadingCard,
  VISA_CARD: DeepLinkScreen.VisaCard,
  CREDIT_CARD_LIMIT: DeepLinkScreen.CreditCardLimit,
}

export const DeepLinkAction = {
  SetLnAddressModal: "SetLnAddressModal",
  SetDefaultAccountModal: "SetDefaultAccountModal",
  UpgradeAccountModal: "UpgradeAccountModal",
} as const

export const DeepLinkActionNameToDeepLinkAction: Record<string, DeepLinkAction> = {
  SET_LN_ADDRESS_MODAL: DeepLinkAction.SetLnAddressModal,
  SET_DEFAULT_ACCOUNT_MODAL: DeepLinkAction.SetDefaultAccountModal,
  UPGRADE_ACCOUNT_MODAL: DeepLinkAction.UpgradeAccountModal,
}

export const Icon = {
  ArrowRight: "ArrowRight",
  ArrowLeft: "ArrowLeft",
  BackSpace: "BackSpace",
  Bank: "Bank",
  Bitcoin: "Bitcoin",
  Book: "Book",
  BtcBook: "BtcBook",
  CaretDown: "CaretDown",
  CaretLeft: "CaretLeft",
  CaretRight: "CaretRight",
  CaretUp: "CaretUp",
  CheckCircle: "CheckCircle",
  Check: "Check",
  Close: "Close",
  CloseCrossWithBackground: "CloseCrossWithBackground",
  Coins: "Coins",
  People: "People",
  CopyPaste: "CopyPaste",
  Dollar: "Dollar",
  EyeSlash: "EyeSlash",
  Eye: "Eye",
  Filter: "Filter",
  Globe: "Globe",
  Graph: "Graph",
  Image: "Image",
  Info: "Info",
  Lightning: "Lightning",
  Link: "Link",
  Loading: "Loading",
  MagnifyingGlass: "MagnifyingGlass",
  Map: "Map",
  Menu: "Menu",
  Pencil: "Pencil",
  Note: "Note",
  Rank: "Rank",
  QrCode: "QrCode",
  Question: "Question",
  Receive: "Receive",
  Send: "Send",
  Settings: "Settings",
  Share: "Share",
  Transfer: "Transfer",
  User: "User",
  Video: "Video",
  Warning: "Warning",
  WarningWithBackground: "WarningWithBackground",
  PaymentSuccess: "PaymentSuccess",
  PaymentPending: "PaymentPending",
  PaymentError: "PaymentError",
  Bell: "Bell",
  Refresh: "Refresh",
} as const

export const IconNameToIcon: Record<string, Icon> = {
  ARROW_RIGHT: Icon.ArrowRight,
  ARROW_LEFT: Icon.ArrowLeft,
  BACKSPACE: Icon.BackSpace,
  BANK: Icon.Bank,
  BITCOIN: Icon.Bitcoin,
  BOOK: Icon.Book,
  BTC_BOOK: Icon.BtcBook,
  CARET_DOWN: Icon.CaretDown,
  CARET_LEFT: Icon.CaretLeft,
  CARET_RIGHT: Icon.CaretRight,
  CARET_UP: Icon.CaretUp,
  CHECK_CIRCLE: Icon.CheckCircle,
  CHECK: Icon.Check,
  CLOSE: Icon.Close,
  CLOSE_CROSS_WITH_BACKGROUND: Icon.CloseCrossWithBackground,
  COINS: Icon.Coins,
  PEOPLE: Icon.People,
  COPY_PASTE: Icon.CopyPaste,
  DOLLAR: Icon.Dollar,
  EYE_SLASH: Icon.EyeSlash,
  EYE: Icon.Eye,
  FILTER: Icon.Filter,
  GLOBE: Icon.Globe,
  GRAPH: Icon.Graph,
  IMAGE: Icon.Image,
  INFO: Icon.Info,
  LIGHTNING: Icon.Lightning,
  LINK: Icon.Link,
  LOADING: Icon.Loading,
  MAGNIFYING_GLASS: Icon.MagnifyingGlass,
  MAP: Icon.Map,
  MENU: Icon.Menu,
  PENCIL: Icon.Pencil,
  NOTE: Icon.Note,
  RANK: Icon.Rank,
  QR_CODE: Icon.QrCode,
  QUESTION: Icon.Question,
  RECEIVE: Icon.Receive,
  SEND: Icon.Send,
  SETTINGS: Icon.Settings,
  SHARE: Icon.Share,
  TRANSFER: Icon.Transfer,
  USER: Icon.User,
  VIDEO: Icon.Video,
  WARNING: Icon.Warning,
  WARNING_WITH_BACKGROUND: Icon.WarningWithBackground,
  PAYMENT_SUCCESS: Icon.PaymentSuccess,
  PAYMENT_PENDING: Icon.PaymentPending,
  PAYMENT_ERROR: Icon.PaymentError,
  BELL: Icon.Bell,
  REFRESH: Icon.Refresh,
}

export const NotificationStatus = {
  Invited: "invited",
  BannerClicked: "banner_clicked",
  InvitationInfoCompleted: "invitation_info_completed",
  KycInitiated: "kyc_initiated",
  KycPassed: "kyc_passed",
  CardInfoSubmitted: "card_info_submitted",
  CardApproved: "card_approved",
  InviteWithdrawn: "invite_withdrawn",
  KycFailed: "kyc_failed",
  CardDenied: "card_denied",
} satisfies Record<string, MsgMessageStatus>

export const checkedToNotificationStatus = (
  status: string,
): MsgMessageStatus | ValidationError => {
  if (!Object.values(NotificationStatus).includes(status as MsgMessageStatus)) {
    return new InvalidNotificationStatusError()
  }

  return status as MsgMessageStatus
}

export const checkedToIconFromIconName = (iconName?: string): Icon | ValidationError => {
  const icon = iconName ? IconNameToIcon[iconName] : null
  if (!icon) return new InvalidNotificationIconError()

  return icon
}

export const checkedToDeepLinkScreen = (
  screen: string,
): DeepLinkScreen | ValidationError => {
  if (!Object.values(DeepLinkScreen).includes(screen as DeepLinkScreen)) {
    return new InvalidNotificationDeepLinkScreenError()
  }

  return screen as DeepLinkScreen
}

export const checkedToDeepLinkAction = (
  action: string,
): DeepLinkAction | ValidationError => {
  if (!Object.values(DeepLinkAction).includes(action as DeepLinkAction)) {
    return new InvalidNotificationDeepLinkActionError()
  }

  return action as DeepLinkAction
}

export const checkedToOpenDeepLink = ({
  deeplinkScreen,
  deeplinkAction,
}: {
  deeplinkScreen?: string
  deeplinkAction?: string
}): OpenDeepLink | undefined | ValidationError => {
  if (!deeplinkScreen && !deeplinkAction) return

  const screenValue = deeplinkScreen
    ? (DeepLinkScreenNameToDeepLinkScreen[deeplinkScreen] ?? deeplinkScreen)
    : undefined

  const checkedScreen = screenValue ? checkedToDeepLinkScreen(screenValue) : undefined
  if (checkedScreen instanceof Error) return checkedScreen

  const actionValue = deeplinkAction
    ? (DeepLinkActionNameToDeepLinkAction[deeplinkAction] ?? deeplinkAction)
    : undefined

  const checkedAction = actionValue ? checkedToDeepLinkAction(actionValue) : undefined
  if (checkedAction instanceof Error) return checkedAction

  return {
    screen: checkedScreen,
    action: checkedAction,
  }
}

export const checkedToOpenExternalUrl = (
  externalUrl?: string,
): OpenExternalUrl | undefined | ValidationError => {
  if (!externalUrl) return

  try {
    new URL(externalUrl)
  } catch {
    return new InvalidNotificationExternalUrlError()
  }

  return { url: externalUrl }
}

export const checkedToLocalizedNotificationTitle = (
  title: string,
): LocalizedNotificationTitle | ValidationError => {
  if (title.length === 0) {
    return new InvalidNotificationTitleError()
  }

  return title as LocalizedNotificationTitle
}

export const checkedToLocalizedNotificationBody = (
  body: string,
): LocalizedNotificationBody | ValidationError => {
  if (body.length === 0) {
    return new InvalidNotificationBodyError()
  }

  return body as LocalizedNotificationBody
}

export const checkedToLocalizedNotificationContentsMap = (
  localizedNotificationContents: {
    title: string
    body: string
    language: string
  }[],
): Map<UserLanguage, LocalizedNotificationContent> | ValidationError => {
  const map = new Map<UserLanguage, LocalizedNotificationContent>()

  for (const content of localizedNotificationContents) {
    const checkedLanguage = checkedToNonEmptyLanguage(content.language.toLowerCase())
    if (checkedLanguage instanceof Error) {
      return checkedLanguage
    }

    const checkedTitle = checkedToLocalizedNotificationTitle(content.title)
    if (checkedTitle instanceof Error) {
      return checkedTitle
    }

    const checkedBody = checkedToLocalizedNotificationBody(content.body)
    if (checkedBody instanceof Error) {
      return checkedBody
    }

    if (map.has(checkedLanguage)) {
      return new DuplicateLocalizedNotificationContentError(
        `Duplicated language: ${checkedLanguage}`,
      )
    }

    map.set(checkedLanguage, {
      title: checkedTitle,
      body: checkedBody,
      language: checkedLanguage,
    })
  }

  return map
}
