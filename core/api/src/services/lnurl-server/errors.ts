import { AxiosError, isAxiosError } from "axios"

import {
  LnurlServerBadRequestError,
  LnurlServerBlinkAccountExistsError,
  LnurlServerConflictError,
  LnurlServerForbiddenError,
  LnurlServerIdentifierConflictError,
  LnurlServerNotFoundError,
  LnurlServerUnauthorizedError,
  LnurlServerUnavailableError,
  UnknownLnurlServerServiceError,
} from "@/domain/lnurl-server"
import { parseErrorMessageFromUnknown } from "@/domain/shared"

const parseLnurlServerErrorMessage = (err: AxiosError): string => {
  const data = err.response?.data

  if (typeof data === "string") return data

  if (data && typeof data === "object") {
    if ("error" in data && typeof data.error === "string") return data.error
    if ("reason" in data && typeof data.reason === "string") return data.reason
    if ("message" in data && typeof data.message === "string") return data.message
  }

  return err.message
}

export const handleLnurlServerErrors = (err: Error | string | unknown) => {
  if (isAxiosError(err)) {
    const errMsg = parseLnurlServerErrorMessage(err)

    switch (err.response?.status) {
      case 400:
        return new LnurlServerBadRequestError(errMsg)
      case 401:
        return new LnurlServerUnauthorizedError(errMsg)
      case 403:
        return new LnurlServerForbiddenError(errMsg)
      case 404:
        return new LnurlServerNotFoundError(errMsg)
      case 409:
        if (errMsg === "identifier_conflict") {
          return new LnurlServerIdentifierConflictError(errMsg)
        }
        if (errMsg === "blink_account_exists") {
          return new LnurlServerBlinkAccountExistsError(errMsg)
        }
        return new LnurlServerConflictError(errMsg)
      case 503:
        return new LnurlServerUnavailableError(errMsg)
      default:
        return new UnknownLnurlServerServiceError(errMsg)
    }
  }

  return new UnknownLnurlServerServiceError(parseErrorMessageFromUnknown(err))
}
