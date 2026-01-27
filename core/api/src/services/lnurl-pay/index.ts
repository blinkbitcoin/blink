import { utils, requestInvoice } from "lnurl-pay"

import { baseLogger } from "@/services/logger"
import { wrapAsyncFunctionsToRunInSpan } from "../tracing"

import { toSats } from "@/domain/bitcoin"
import { checkedToLnurlSuccessAction } from "@/domain/bitcoin/lnurl"
import {
  ErrorFetchingLnurlInvoice,
  LnurlServiceError,
  UnknownLnurlServiceError,
} from "@/domain/bitcoin/lnurl/errors"

export const LnurlPayService = (): ILnurlPayService => {
  const fetchInvoiceFromLnAddressOrLnurl = async ({
    amount,
    lnAddressOrLnurl,
  }: {
    amount: BtcPaymentAmount
    lnAddressOrLnurl: string
  }): Promise<LnurlPayInvoiceResponse | LnurlServiceError> => {
    try {
      const response = await requestInvoice({
        lnUrlOrAddress: lnAddressOrLnurl,
        tokens: utils.toSats(toSats(amount.amount)),
      })

      if (!response.hasValidAmount) {
        return new ErrorFetchingLnurlInvoice(
          "Lnurl service returned an invoice with an invalid amount",
        )
      }

      const successAction = checkedToLnurlSuccessAction(response.successAction)
      if (successAction instanceof Error) {
        // Log the validation error but don't fail the payment - successAction is optional
        baseLogger.error(
          { err: successAction, lnAddressOrLnurl },
          "Invalid LNURL successAction received, proceeding without it",
        )
        return {
          invoice: response.invoice,
          successAction: null,
        }
      }

      return {
        invoice: response.invoice,
        successAction,
      }
    } catch (err) {
      if (err instanceof Error) {
        return new ErrorFetchingLnurlInvoice(err.message)
      }
      return new UnknownLnurlServiceError(err)
    }
  }

  return wrapAsyncFunctionsToRunInSpan({
    namespace: "services.lnurl-pay",
    fns: {
      fetchInvoiceFromLnAddressOrLnurl,
    },
  })
}
