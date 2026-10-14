import { parsePhoneNumberFromString } from "libphonenumber-js"
import disposablePhoneList from "@ip1sms/disposable-phone-numbers"

import {
  InvalidPhoneNumber,
  InvalidChannel,
  InvalidChannelForCountry,
} from "@/domain/errors"
import {
  getSmsAuthUnsupportedCountries,
  getWhatsAppAuthUnsupportedCountries,
  getTelegramAuthUnsupportedCountries,
} from "@/config"

export * from "./errors"

// from https://www.twilio.com/docs/lookup/v2-api/line-type-intelligence#type-property-values
export const CarrierType = {
  Landline: "landline",
  Mobile: "mobile",
  FixedVoip: "fixedVoip",
  NonFixedVoip: "nonFixedVoip",
  Personal: "personal",
  TollFree: "tollFree",
  Premium: "premium",
  SharedCost: "sharedCost",
  Uan: "uan",
  Voicemail: "voicemail",
  Pager: "pager",
  Unknown: "unknown",

  Null: "",

  // legacy
  // those values may have been returned histortically
  // TODO: migration to remove those values
  Voip: "voip",
} as const

export const ChannelType = {
  Sms: "sms",
  Whatsapp: "whatsapp",
  Telegram: "telegram",
} as const

export const DevicePlatform = {
  Android: "android",
  Ios: "ios",
  Web: "web",
} as const

export const USER_AGENT_MAX_LENGTH = 512

export const normalizeUserAgent = (ua?: string): string | undefined => {
  const trimmed = ua?.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, USER_AGENT_MAX_LENGTH)
}

const CHANNEL_CONFIG = {
  [ChannelType.Sms]: getSmsAuthUnsupportedCountries,
  [ChannelType.Whatsapp]: getWhatsAppAuthUnsupportedCountries,
  [ChannelType.Telegram]: getTelegramAuthUnsupportedCountries,
} as const

export const checkedToChannel = (
  phone: string,
  channel: string,
): ChannelType | ValidationError => {
  if (!phone) {
    return new InvalidPhoneNumber(phone)
  }

  if (!channel) {
    return new InvalidChannel(channel)
  }

  const phoneNumber = parsePhoneNumberFromString(phone)
  if (!phoneNumber?.country) {
    return new InvalidPhoneNumber(phone)
  }

  const normalizedChannel = channel.toLowerCase()
  const getUnsupportedCountries =
    CHANNEL_CONFIG[normalizedChannel as keyof typeof CHANNEL_CONFIG]

  if (!getUnsupportedCountries) {
    return new InvalidChannel(channel)
  }

  if (getUnsupportedCountries().includes(phoneNumber.country as CountryCode)) {
    return new InvalidChannelForCountry(channel)
  }

  return normalizedChannel as ChannelType
}

export const isDisposablePhoneNumber = (phone: PhoneNumber) => {
  const phoneNumber = phone.replace(/[^0-9]/, "")
  return phoneNumber in disposablePhoneList
}
