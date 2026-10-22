import { getCallbackServiceConfig, UNSECURE_CALLBACK_ENDPOINT_URLS } from "@/config"
import { isPublicUnicastIp } from "@/domain/accounts-ips"
import {
  checkedToCallbackEndpointUrl,
  INVALID_CALLBACK_ENDPOINT_URL,
} from "@/domain/callback"
import { InvalidUrlError } from "@/domain/callback/errors"
import { DnsService } from "@/services/dns"
import { CallbackService } from "@/services/svix"
import { UnknownSvixError } from "@/services/svix/errors"
import { checkedToAccountId } from "@/domain/accounts"

export const addEndpoint = async ({
  accountId: accountIdRaw,
  url: urlRaw,
}: {
  accountId: string
  url: string
}) => {
  const url = UNSECURE_CALLBACK_ENDPOINT_URLS
    ? urlRaw
    : await checkedToPublicCallbackEndpointUrl(urlRaw)
  if (url instanceof Error) return url

  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const callbackService = CallbackService(getCallbackServiceConfig())
  const endpointId = await callbackService.addEndpoint({ accountId, url })

  if (endpointId instanceof Error) return endpointId
  if (!endpointId) throw new UnknownSvixError("CallbackService not configured")

  return { id: endpointId }
}

const checkedToPublicCallbackEndpointUrl = async (
  urlRaw: string,
): Promise<CallbackEndpointUrl | InvalidUrlError> => {
  const checked = checkedToCallbackEndpointUrl(urlRaw)
  if (checked instanceof Error) return checked

  const addresses = await DnsService().lookupAddresses(checked.hostname)
  // Fail closed on mixed public/private answers.
  if (addresses instanceof Error || !addresses.every(isPublicUnicastIp)) {
    return new InvalidUrlError(INVALID_CALLBACK_ENDPOINT_URL)
  }

  return checked.url
}

export const listEndpoints = async (accountIdRaw: string) => {
  const accountId = checkedToAccountId(accountIdRaw)
  if (accountId instanceof Error) return accountId

  const callbackService = CallbackService(getCallbackServiceConfig())
  return callbackService.listEndpoints(accountId)
}

export const deleteEndpoint = async ({
  accountId,
  id,
}: {
  accountId: AccountId
  id: string
}) => {
  const callbackService = CallbackService(getCallbackServiceConfig())
  return callbackService.deleteEndpoint({ accountId, endpointId: id })
}

export const getPortalUrl = async ({ accountId }: { accountId: AccountId }) => {
  const callbackService = CallbackService(getCallbackServiceConfig())
  return callbackService.getPortalUrl(accountId)
}
