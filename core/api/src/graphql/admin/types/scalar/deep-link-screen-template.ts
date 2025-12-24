import { GT } from "@/graphql/index"

const DeepLinkScreenTemplate = GT.Enum({
  name: "DeepLinkScreenTemplate",
  values: {
    CIRCLES: {
      value: "CIRCLES",
    },
    PRICE: {
      value: "PRICE",
    },
    EARN: {
      value: "EARN",
    },
    MAP: {
      value: "MAP",
    },
    PEOPLE: {
      value: "PEOPLE",
    },
    HOME: {
      value: "HOME",
    },
    RECEIVE: {
      value: "RECEIVE",
    },
    CONVERT: {
      value: "CONVERT",
    },
    SCAN_QR: {
      value: "SCAN_QR",
    },
    CHAT: {
      value: "CHAT",
    },
    SETTINGS: {
      value: "SETTINGS",
    },
    SETTINGS_2FA: {
      value: "SETTINGS_2FA",
    },
    SETTINGS_DISPLAY_CURRENCY: {
      value: "SETTINGS_DISPLAY_CURRENCY",
    },
    SETTINGS_DEFAULT_ACCOUNT: {
      value: "SETTINGS_DEFAULT_ACCOUNT",
    },
    SETTINGS_LANGUAGE: {
      value: "SETTINGS_LANGUAGE",
    },
    SETTINGS_THEME: {
      value: "SETTINGS_THEME",
    },
    SETTINGS_SECURITY: {
      value: "SETTINGS_SECURITY",
    },
    SETTINGS_ACCOUNT: {
      value: "SETTINGS_ACCOUNT",
    },
    SETTINGS_TX_LIMITS: {
      value: "SETTINGS_TX_LIMITS",
    },
    SETTINGS_NOTIFICATIONS: {
      value: "SETTINGS_NOTIFICATIONS",
    },
    SETTINGS_EMAIL: {
      value: "SETTINGS_EMAIL",
    },
    WELCOME_CARD: {
      value: "WELCOME_CARD",
    },
    LOADING_CARD: {
      value: "LOADING_CARD",
    },
    VISA_CARD: {
      value: "VISA_CARD",
    },
    CREDIT_CARD_LIMIT: {
      value: "CREDIT_CARD_LIMIT",
    },
  },
})

export default DeepLinkScreenTemplate
