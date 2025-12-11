// TODO: Temporary mock data for development
// This file will be removed once invitation and template data is fetched via API
// Delete this file after API integration is complete

import { InvitationRow, TemplateRow } from "./invitations/types"
import {
  NotificationContent,
  LocalizedNotificationContent,
} from "../components/notification/builder"
import { NotificationIcon, DeepLinkScreen, DeepLinkAction } from "../generated"
import { NotificationAction } from "../components/notification/types"

export type InvitationContent = {
  id: string
  localizedNotificationContents: LocalizedNotificationContent[]
  action?: NotificationAction
  openDeepLink?: {
    screen?: DeepLinkScreen | undefined
    action?: DeepLinkAction | undefined
  }
  openExternalUrl?: {
    url: string
  }
  icon?: NotificationIcon | undefined
  shouldSendPush: boolean
  shouldAddToHistory: boolean
  shouldAddToBulletin: boolean
}

export const visaInvitationsMock: InvitationRow[] = [
  {
    id: "720377a1-bfa2-477b-89da-21c46d908370",
    status: "active",
    lastActivity: "2025-12-03",
    sentBy: "Admin",
  },
  {
    id: "newuser1",
    status: "pending",
    lastActivity: "2025-12-01",
    sentBy: "Admin",
  },
  {
    id: "satoshi",
    status: "accepted",
    lastActivity: "2025-11-25",
    sentBy: "Admin",
  },
  {
    id: "newuser2",
    status: "accepted",
    lastActivity: "2025-11-23",
    sentBy: "Admin",
  },
  {
    id: "josenakamoto",
    status: "revoked",
    lastActivity: "2025-11-15",
    sentBy: "Admin",
  },
  {
    id: "newuser3",
    status: "pending",
    lastActivity: "2025-11-10",
    sentBy: "Admin",
  },
  {
    id: "newuser4",
    status: "pending",
    lastActivity: "2025-11-06",
    sentBy: "Admin",
  },
  {
    id: "aveotero",
    status: "pending",
    lastActivity: "2025-10-21",
    sentBy: "Admin",
  },
  {
    id: "olduser1",
    status: "revoked",
    lastActivity: "2025-09-26",
    sentBy: "Admin",
  },
  {
    id: "olduser2",
    status: "revoked",
    lastActivity: "2025-09-11",
    sentBy: "Admin",
  },
]

export const visaTemplatesMock: TemplateRow[] = [
  {
    id: "blink-private-en",
    name: "Blink Private Invite (EN)",
    language: "English",
    icon: "star",
    title: "Blink Private is here!",
    body: "Sign up to get your Visa card and more",
    sendPush: true,
    addHistory: false,
    addBulletin: true,
  },
  {
    id: "blink-private-es",
    name: "Blink Private Invite (ES)",
    language: "Spanish",
    icon: "star",
    title: "¡Blink Private ya está aquí!",
    body: "Regístrate para obtener tu tarjeta Visa y más",
    sendPush: true,
    addHistory: false,
    addBulletin: false,
  },
  {
    id: "blink-private-fr",
    name: "Blink Private Invite (FR)",
    language: "French",
    icon: "star",
    title: "Blink Private est arrivé !",
    body: "Inscrivez-vous pour obtenir votre carte Visa et plus encore",
    sendPush: true,
    addHistory: true,
    addBulletin: true,
  },
  {
    id: "blink-private-de",
    name: "Blink Private Invite (DE)",
    language: "German",
    icon: "star",
    title: "Blink Private ist da!",
    body: "Melden Sie sich an, um Ihre Visa-Karte und mehr zu erhalten",
    sendPush: true,
    addHistory: true,
    addBulletin: true,
  },
  {
    id: "card-active-en",
    name: "Card Active (EN)",
    language: "English",
    icon: "check",
    title: "Your Blink Private Card is Active!",
    body: "Your card is now active and ready to use.",
    sendPush: true,
    addHistory: false,
    addBulletin: false,
  },
]

export const notificationContentMock: InvitationContent[] = [
  {
    id: "blink-private-en",
    localizedNotificationContents: [
      {
        language: "en",
        title: "Blink Private is here!",
        body: "Sign up to get your Visa card and more",
      },
    ],
    openDeepLink: {
      screen: "CHAT",
    },
    icon: "BELL",
    shouldSendPush: true,
    shouldAddToHistory: false,
    shouldAddToBulletin: true,
  },
  {
    id: "blink-private-es",
    localizedNotificationContents: [
      {
        language: "es",
        title: "¡Blink Private ya está aquí!",
        body: "Regístrate para obtener tu tarjeta Visa y más",
      },
    ],
    openDeepLink: {
      screen: "CHAT",
    },
    icon: "BELL",
    shouldSendPush: true,
    shouldAddToHistory: false,
    shouldAddToBulletin: false,
  },
  {
    id: "blink-private-fr",
    localizedNotificationContents: [
      {
        language: "fr",
        title: "Blink Private est arrivé !",
        body: "Inscrivez-vous pour obtenir votre carte Visa et plus encore",
      },
    ],
    openDeepLink: {
      screen: "CHAT",
    },
    icon: "BELL",
    shouldSendPush: true,
    shouldAddToHistory: true,
    shouldAddToBulletin: true,
  },
  {
    id: "blink-private-de",
    localizedNotificationContents: [
      {
        language: "de",
        title: "Blink Private ist da!",
        body: "Melden Sie sich an, um Ihre Visa-Karte und mehr zu erhalten",
      },
    ],
    openDeepLink: {
      screen: "CHAT",
    },
    icon: "BELL",
    shouldSendPush: true,
    shouldAddToHistory: true,
    shouldAddToBulletin: true,
  },
  {
    id: "card-active-en",
    localizedNotificationContents: [
      {
        language: "en",
        title: "Your Blink Private Card is Active!",
        body: "Your card is now active and ready to use.",
      },
    ],
    openDeepLink: {
      screen: "CHAT",
    },
    icon: "CHECK",
    shouldSendPush: true,
    shouldAddToHistory: false,
    shouldAddToBulletin: false,
  },
]
