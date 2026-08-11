import { create as createAxiosInstance } from "axios"
import { utils, requestInvoice } from "lnurl-pay"

import { wrapAsyncFunctionsToRunInSpan } from "../tracing"

import { toSats } from "@/domain/bitcoin"
import { decodeInvoice } from "@/domain/bitcoin/lightning"
import {
  ErrorFetchingLnurlInvoice,
  LnurlServiceError,
  UnknownLnurlServiceError,
  UnsupportedLnAddressDomainError,
} from "@/domain/bitcoin/lnurl/errors"
import { LNURL_SERVER_LN_ADDRESS_DOMAIN } from "@/config"

export const lnurlPayClient = createAxiosInstance({
  timeout: 2000,
  maxContentLength: 100 * 1024,
  maxRedirects: 0,
})

// Restricts every outbound LNURL request to the trusted Blink LN-address domain,
// preventing the server from being used to fetch arbitrary client-supplied URLs (SSRF).
const trustedDomainFetchGet =
  (trustedDomain: string) =>
  async ({ url, params }: { url: string; params?: Record<string, unknown> }) => {
    const { hostname: trustedHost } = new URL(`https://${trustedDomain}`)
    const { hostname, protocol } = new URL(url)

    if (protocol !== "https:" && protocol !== "http:") {
      throw new UnsupportedLnAddressDomainError(`Unsupported protocol: ${protocol}`)
    }
    if (hostname !== trustedHost) {
      throw new UnsupportedLnAddressDomainError(
        `Refusing to fetch untrusted host: ${hostname}`,
      )
    }

    const { data } = await lnurlPayClient.get(url, { params })
    return data
  }

export const LnurlPayService = (): ILnurlPayService => {
  const fetchInvoiceFromLnAddressOrLnurl = async ({
    amount,
    lnAddressOrLnurl,
  }: {
    amount: BtcPaymentAmount
    lnAddressOrLnurl: string
  }): Promise<string | LnurlServiceError> => {
    try {
      const invoice = await requestInvoice({
        lnUrlOrAddress: lnAddressOrLnurl,
        tokens: utils.toSats(toSats(amount.amount)),
      })

      if (!invoice.hasValidAmount) {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service returned an invoice with an invalid amount",
        )
      }

      return invoice.invoice
    } catch (err) {
      if (err instanceof Error) {
        return new ErrorFetchingLnurlInvoice(err.message)
      }
      return new UnknownLnurlServiceError(err)
    }
  }

  const createInvoiceForLnAddress = async ({
    amount,
    lnAddress,
  }: {
    amount: BtcPaymentAmount
    lnAddress: string
  }): Promise<LnAddressInvoice | LnurlServiceError> => {
    const parsed = utils.parseLightningAddress(lnAddress)
    if (!parsed) {
      return new ErrorFetchingLnurlInvoice(`Invalid lightning address: ${lnAddress}`)
    }
    if (parsed.domain !== LNURL_SERVER_LN_ADDRESS_DOMAIN) {
      return new UnsupportedLnAddressDomainError(
        `Only ${LNURL_SERVER_LN_ADDRESS_DOMAIN} lightning addresses are supported`,
      )
    }

    try {
      const invoice = await requestInvoice({
        lnUrlOrAddress: lnAddress,
        tokens: utils.toSats(toSats(amount.amount)),
        fetchGet: trustedDomainFetchGet(parsed.domain),
      })

      if (!invoice.hasValidAmount) {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service returned an invoice with an invalid amount",
        )
      }

      const verify = invoice.rawData?.verify
      if (typeof verify !== "string" || verify === "") {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service did not return a LUD-21 verify url",
        )
      }

      const decoded = decodeInvoice(invoice.invoice)
      if (decoded instanceof Error) return decoded

      return {
        paymentRequest: decoded.paymentRequest,
        paymentHash: decoded.paymentHash,
        verify,
      }
    } catch (err) {
      if (err instanceof LnurlServiceError) return err
      if (err instanceof Error) return new ErrorFetchingLnurlInvoice(err.message)
      return new UnknownLnurlServiceError(err)
    }
  }

  const checkInvoiceStatusFromVerifyUrl = async (
    verify: string,
  ): Promise<LnAddressInvoiceStatus | LnurlServiceError> => {
    try {
      const { hostname } = new URL(verify)
      const { hostname: trustedHost } = new URL(
        `https://${LNURL_SERVER_LN_ADDRESS_DOMAIN}`,
      )
      if (hostname !== trustedHost) {
        return new UnsupportedLnAddressDomainError(
          `Refusing to fetch untrusted host: ${hostname}`,
        )
      }

      const { data } = await lnurlPayClient.get(verify)
      if (data?.status === "ERROR") {
        return new ErrorFetchingLnurlInvoice(data.reason || "verify returned an error")
      }

      const settled = data?.settled === true
      const preimage =
        settled && typeof data?.preimage === "string" && data.preimage !== ""
          ? (data.preimage as RevealedPreImage)
          : null

      return { settled, preimage }
    } catch (err) {
      if (err instanceof Error) return new ErrorFetchingLnurlInvoice(err.message)
      return new UnknownLnurlServiceError(err)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.lnurl-pay",
    fns: {
      fetchInvoiceFromLnAddressOrLnurl,
      createInvoiceForLnAddress,
      checkInvoiceStatusFromVerifyUrl,
    },
  })
}
