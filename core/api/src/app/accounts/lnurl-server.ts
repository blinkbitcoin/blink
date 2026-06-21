import { LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"
import {
  LnurlServerMissingInternalUrlError,
  LnurlServerNotFoundError,
} from "@/domain/lnurl-server"
import { LnurlServerService } from "@/services/lnurl-server"

export const getLnurlServerService = (): ILnurlServerService | null => {
  const service = LnurlServerService()

  if (service instanceof LnurlServerMissingInternalUrlError) return null

  return service
}

export const usernameAvailableForLnurlServer = async (
  username: Username,
): Promise<boolean | ApplicationError> => {
  const service = getLnurlServerService()
  if (service === null) return true

  const result = await service.getIdentifier({
    domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
    identifier: username,
  })

  if (result instanceof LnurlServerNotFoundError) return true
  if (result instanceof Error) return result

  return false
}
