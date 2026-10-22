import { InvalidUrlError } from "./errors"

export const INVALID_CALLBACK_ENDPOINT_URL = "Invalid callback endpoint URL"

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
): { url: CallbackEndpointUrl; hostname: string } | InvalidUrlError => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
  if (!hostname) return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)

  return { url: url as CallbackEndpointUrl, hostname }
}
