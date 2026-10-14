import { utils, requestInvoice } from "lnurl-pay"

import { wrapAsyncFunctionsToRunInSpan } from "../tracing"

import { safeFetchGet } from "./safe-fetch"

import { toSats } from "@/domain/bitcoin"
import {
  ErrorFetchingLnurlInvoice,
  LnurlServiceError,
} from "@/domain/bitcoin/lnurl/errors"

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
        fetchGet: safeFetchGet,
      })

      if (!invoice.hasValidAmount) {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service returned an invoice with an invalid amount",
        )
      }

      return invoice.invoice
    } catch {
      return new ErrorFetchingLnurlInvoice("LNURL service unreachable or not allowed")
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.lnurl-pay",
    fns: {
      fetchInvoiceFromLnAddressOrLnurl,
    },
  })
}
