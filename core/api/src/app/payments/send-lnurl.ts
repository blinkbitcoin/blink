import { payInvoiceByWalletId } from "./send-lightning"

import { LnurlPayService } from "@/services/lnurl-pay"
import { checkedToBtcPaymentAmount } from "@/domain/shared"

export const lnAddressPaymentSend = async ({
  senderWalletId,
  senderAccount,
  amount: uncheckedAmount,
  lnAddress,
}: LnAddressPaymentSendArgs): Promise<PaymentSendResult | ApplicationError> => {
  const amount = checkedToBtcPaymentAmount(uncheckedAmount)

  if (amount instanceof Error) {
    return amount
  }

  const lnurlResponse = await LnurlPayService().fetchInvoiceFromLnAddressOrLnurl({
    amount,
    lnAddressOrLnurl: lnAddress,
  })

  if (lnurlResponse instanceof Error) {
    return lnurlResponse
  }

  return payInvoiceByWalletId({
    uncheckedPaymentRequest: lnurlResponse.invoice,
    memo: null,
    senderWalletId,
    senderAccount,
    lnurlSuccessAction: lnurlResponse.successAction,
  })
}

export const lnurlPaymentSend = async ({
  senderWalletId,
  senderAccount,
  amount: uncheckedAmount,
  lnurl,
}: LnurlPaymentSendArgs): Promise<PaymentSendResult | ApplicationError> => {
  const amount = checkedToBtcPaymentAmount(uncheckedAmount)

  if (amount instanceof Error) {
    return amount
  }

  const lnurlResponse = await LnurlPayService().fetchInvoiceFromLnAddressOrLnurl({
    amount,
    lnAddressOrLnurl: lnurl,
  })

  if (lnurlResponse instanceof Error) {
    return lnurlResponse
  }

  return payInvoiceByWalletId({
    uncheckedPaymentRequest: lnurlResponse.invoice,
    memo: null,
    senderWalletId,
    senderAccount,
    lnurlSuccessAction: lnurlResponse.successAction,
  })
}
