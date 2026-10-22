import { isIP } from "node:net"

import { InvalidUrlError } from "./errors"

import { isPublicUnicastIp } from "@/domain/accounts-ips"

export const INVALID_CALLBACK_ENDPOINT_URL = "Invalid callback endpoint URL"

const INTERNAL_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".localdomain",
  ".local",
  ".internal",
  ".intranet",
  ".svc",
  ".lan",
  ".corp",
  ".home.arpa",
]

export const CallbackEventType = {
  SendIntraledger: "send.intraledger",
  ReceiveIntraledger: "receive.intraledger",
  SendLightning: "send.lightning",
  ReceiveLightning: "receive.lightning",
  SendOnchain: "send.onchain",
  ReceiveOnchain: "receive.onchain",
} as const

export const checkedToCallbackEndpointUrl = (
  url: string,
): CallbackEndpointUrl | InvalidUrlError => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "")
  if (isIP(hostname)) {
    return isPublicUnicastIp(hostname)
      ? (url as CallbackEndpointUrl)
      : new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  if (
    !hostname.includes(".") ||
    INTERNAL_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  return url as CallbackEndpointUrl
}
