import { getLnurlServerService } from "./lnurl-server"

import { LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"
import { LnurlServerNotFoundError } from "@/domain/lnurl-server"

export const getAccountIdentifier = async (
  username: Username,
): Promise<AccountIdentifier | ApplicationError> => {
  const service = getLnurlServerService()
  if (service === null) return { exists: false, provider: null }

  const result = await service.getIdentifier({
    domain: LNURL_SERVER_LN_ADDRESS_DOMAIN,
    identifier: username,
  })

  if (result instanceof LnurlServerNotFoundError) {
    return { exists: false, provider: null }
  }
  if (result instanceof Error) return result

  return { exists: true, provider: result.provider }
}
