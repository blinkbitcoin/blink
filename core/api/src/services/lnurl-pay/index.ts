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

// Pins an outbound URL to the trusted Blink LN-address host, comparing the full
// host (hostname AND port) and restricting the protocol to http/https, so the
// server cannot be used to fetch arbitrary client-supplied URLs (SSRF) — including
// other ports on the same hostname.
const assertTrustedUrl = (url: string, trustedDomain: string): void => {
  const { host: trustedHost } = new URL(`https://${trustedDomain}`)
  const { host, protocol } = new URL(url)

  if (protocol !== "https:" && protocol !== "http:") {
    throw new UnsupportedLnAddressDomainError(`Unsupported protocol: ${protocol}`)
  }
  if (host !== trustedHost) {
    throw new UnsupportedLnAddressDomainError(`Refusing to fetch untrusted host: ${host}`)
  }
}

const trustedDomainFetchGet =
  (trustedDomain: string) =>
  async ({ url, params }: { url: string; params?: Record<string, unknown> }) => {
    assertTrustedUrl(url, trustedDomain)

    const { data } = await lnurlPayClient.get(url, { params })
    return data
  }

// The lnurl-pay library only accepts TLD-style domains, which rejects the
// host:port domains used in dev/test stacks, so the address is parsed here.
const parseLnAddress = (
  lnAddress: string,
): { username: string; domain: string } | null => {
  const at = lnAddress.lastIndexOf("@")
  const username = lnAddress.slice(0, at)
  const domain = lnAddress.slice(at + 1)
  if (at < 1 || !username || !domain) return null
  return { username, domain }
}

// LUD-01 mandates https on clearnet; local hosts (dev/test stacks) use http.
const schemeForDomain = (domain: string): "http" | "https" => {
  const { hostname } = new URL(`https://${domain}`)
  return hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https"
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
    const parsed = parseLnAddress(lnAddress)
    if (!parsed) {
      return new ErrorFetchingLnurlInvoice(`Invalid lightning address: ${lnAddress}`)
    }
    if (parsed.domain !== LNURL_SERVER_LN_ADDRESS_DOMAIN) {
      return new UnsupportedLnAddressDomainError(
        `Only ${LNURL_SERVER_LN_ADDRESS_DOMAIN} lightning addresses are supported`,
      )
    }

    try {
      const fetchGet = trustedDomainFetchGet(parsed.domain)
      const scheme = schemeForDomain(parsed.domain)

      const payParams = await fetchGet({
        url: `${scheme}://${parsed.domain}/.well-known/lnurlp/${encodeURIComponent(
          parsed.username,
        )}`,
      })
      if (payParams?.status === "ERROR") {
        return new ErrorFetchingLnurlInvoice(
          payParams.reason || "lnurl-pay request returned an error",
        )
      }
      if (typeof payParams?.callback !== "string") {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service did not return a callback url",
        )
      }

      const msats = amount.amount * 1000n
      const { minSendable, maxSendable } = payParams
      if (
        (typeof minSendable === "number" && msats < BigInt(minSendable)) ||
        (typeof maxSendable === "number" && msats > BigInt(maxSendable))
      ) {
        return new ErrorFetchingLnurlInvoice(
          `Amount out of range: min ${minSendable} msats, max ${maxSendable} msats`,
        )
      }

      const invoiceRes = await fetchGet({
        url: payParams.callback,
        params: { amount: msats.toString() },
      })
      if (invoiceRes?.status === "ERROR") {
        return new ErrorFetchingLnurlInvoice(
          invoiceRes.reason || "lnurl-pay callback returned an error",
        )
      }
      if (typeof invoiceRes?.pr !== "string" || invoiceRes.pr === "") {
        return new ErrorFetchingLnurlInvoice("Lnurl service did not return an invoice")
      }

      const verify = invoiceRes.verify
      if (typeof verify !== "string" || verify === "") {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service did not return a LUD-21 verify url",
        )
      }
      assertTrustedUrl(verify, parsed.domain)

      const decoded = decodeInvoice(invoiceRes.pr)
      if (decoded instanceof Error) return decoded
      if (decoded.amount !== toSats(amount.amount)) {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service returned an invoice with an invalid amount",
        )
      }

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
      assertTrustedUrl(verify, LNURL_SERVER_LN_ADDRESS_DOMAIN)

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
      if (err instanceof LnurlServiceError) return err
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
