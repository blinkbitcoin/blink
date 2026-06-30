import { create as createAxiosInstance, isAxiosError } from "axios"

import { handleLnurlServerErrors } from "./errors"

import { LNURL_SERVER_INTERNAL_URL } from "@/config"
import { LnurlServerMissingInternalUrlError } from "@/domain/lnurl-server"
import { baseLogger } from "@/services/logger"
import { wrapAsyncFunctionsToRunInSpan } from "@/services/tracing"

export const lnurlServerClient = createAxiosInstance({
  timeout: 2000,
})

const logLnurlServerDiagnosticError = ({
  err,
  operation,
  details,
}: {
  err: unknown
  operation: string
  details: Record<string, unknown>
}) => {
  if (!isAxiosError(err)) {
    console.error(
      `[lnurl-server-debug] ${JSON.stringify({
        operation,
        details,
        error:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : err,
      })}`,
    )
    return
  }

  console.error(
    `[lnurl-server-debug] ${JSON.stringify({
      operation,
      details,
      request: {
        baseURL: err.config?.baseURL,
        url: err.config?.url,
        method: err.config?.method,
      },
      response: {
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
      },
      code: err.code,
      message: err.message,
    })}`,
  )
}

export const LnurlServerService = ():
  | ILnurlServerService
  | LnurlServerMissingInternalUrlError => {
  if (LNURL_SERVER_INTERNAL_URL.trim() === "") {
    return new LnurlServerMissingInternalUrlError("LNURL_SERVER_INTERNAL_URL is empty")
  }

  const createBlinkAccount = async (
    args: LnurlServerCreateBlinkAccountArgs,
  ): Promise<LnurlServerBlinkAccount | LnurlServerServiceError> => {
    try {
      const request: LnurlServerCreateBlinkAccountRequestRaw = {
        domain: args.domain,
        blink_account_id: args.blinkAccountId,
        btc_wallet_id: args.btcWalletId,
        usd_wallet_id: args.usdWalletId,
        default_wallet: args.defaultWallet,
        description: args.description,
        identifiers: args.identifiers,
      }

      const { data } = await lnurlServerClient.post<LnurlServerCreateBlinkAccountRaw>(
        "/internal/blink/accounts",
        request,
        { baseURL: LNURL_SERVER_INTERNAL_URL },
      )

      return lnurlServerBlinkAccountFromRaw(data)
    } catch (err) {
      logLnurlServerDiagnosticError({
        err,
        operation: "createBlinkAccount",
        details: args,
      })
      baseLogger.error({ err, args }, "Failed to create LNURL server Blink account")
      return handleLnurlServerErrors(err)
    }
  }

  const updateDefaultWallet = async (
    args: LnurlServerUpdateDefaultWalletArgs,
  ): Promise<LnurlServerUpdatedDefaultWallet | LnurlServerServiceError> => {
    try {
      const request: LnurlServerUpdateBlinkAccountDefaultWalletRequestRaw = {
        default_wallet: args.defaultWallet,
      }

      const { data } = await lnurlServerClient.patch<LnurlServerUpdatedDefaultWalletRaw>(
        `/internal/blink/accounts/${encodeURIComponent(args.accountId)}`,
        request,
        { baseURL: LNURL_SERVER_INTERNAL_URL },
      )

      return lnurlServerUpdatedDefaultWalletFromRaw(data)
    } catch (err) {
      logLnurlServerDiagnosticError({
        err,
        operation: "updateDefaultWallet",
        details: args,
      })
      baseLogger.error({ err, args }, "Failed to update LNURL server default wallet")
      return handleLnurlServerErrors(err)
    }
  }

  const getIdentifier = async ({
    domain,
    identifier,
  }: LnurlServerGetIdentifierArgs): Promise<
    LnurlServerIdentifier | LnurlServerServiceError
  > => {
    try {
      const { data } = await lnurlServerClient.get<LnurlServerIdentifierRaw>(
        `/internal/domains/${encodeURIComponent(domain)}/identifiers/${encodeURIComponent(identifier)}`,
        { baseURL: LNURL_SERVER_INTERNAL_URL },
      )

      return lnurlServerIdentifierFromRaw(data)
    } catch (err) {
      logLnurlServerDiagnosticError({
        err,
        operation: "getIdentifier",
        details: { domain, identifier },
      })
      baseLogger.error(
        { err, domain, identifier },
        "Failed to fetch LNURL server identifier",
      )
      return handleLnurlServerErrors(err)
    }
  }

  const transferIdentifierToSpark = async (
    args: LnurlServerTransferToSparkArgs,
  ): Promise<LnurlServerTransferToSparkResult | LnurlServerServiceError> => {
    try {
      const request: LnurlServerTransferToSparkRequestRaw = {
        domain: args.domain,
        identifier: args.identifier,
        destination_spark_pubkey: args.destinationSparkPubkey,
        description: args.description,
      }

      const { data } = await lnurlServerClient.post<LnurlServerTransferToSparkResultRaw>(
        "/internal/identifiers/transfer-to-spark",
        request,
        { baseURL: LNURL_SERVER_INTERNAL_URL },
      )

      return lnurlServerTransferToSparkResultFromRaw(data)
    } catch (err) {
      logLnurlServerDiagnosticError({
        err,
        operation: "transferIdentifierToSpark",
        details: args,
      })
      baseLogger.error(
        { err, args },
        "Failed to transfer LNURL server identifier to Spark",
      )
      return handleLnurlServerErrors(err)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.lnurl-server",
    fns: {
      createBlinkAccount,
      updateDefaultWallet,
      getIdentifier,
      transferIdentifierToSpark,
    },
  })
}

const lnurlServerBlinkAccountFromRaw = (
  response: LnurlServerCreateBlinkAccountRaw,
): LnurlServerBlinkAccount => ({
  accountId: response.account_id,
  provider: response.provider,
  blinkAccountId: response.blink_account_id,
  btcWalletId: response.btc_wallet_id,
  usdWalletId: response.usd_wallet_id,
  defaultWallet: response.default_wallet,
  domain: response.domain,
  identifiers: response.identifiers,
})

const lnurlServerUpdatedDefaultWalletFromRaw = (
  response: LnurlServerUpdatedDefaultWalletRaw,
): LnurlServerUpdatedDefaultWallet => ({
  accountId: response.account_id,
  provider: response.provider,
  blinkAccountId: response.blink_account_id,
  defaultWallet: response.default_wallet,
})

const lnurlServerIdentifierFromRaw = (
  response: LnurlServerIdentifierRaw,
): LnurlServerIdentifier => ({
  provider: response.provider,
  accountId: response.account_id,
  domain: response.domain,
  identifier: response.identifier,
  identifierKind: response.identifier_kind,
  description: response.description,
  requestedWallet: response.requested_wallet,
  providerDetails: {
    sparkPubkey: response.provider_details.spark_pubkey,
    blinkAccountId: response.provider_details.blink_account_id,
    btcWalletId: response.provider_details.btc_wallet_id,
    usdWalletId: response.provider_details.usd_wallet_id,
    defaultWallet: response.provider_details.default_wallet,
  },
})

const lnurlServerTransferToSparkResultFromRaw = (
  response: LnurlServerTransferToSparkResultRaw,
): LnurlServerTransferToSparkResult => ({
  domain: response.domain,
  identifier: response.identifier,
  provider: response.provider,
  sparkPubkey: response.spark_pubkey,
  lightningAddress: response.lightning_address,
  lnurl: response.lnurl,
})
