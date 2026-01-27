type LnurlServiceError = import("@/domain/bitcoin/lnurl/errors").LnurlServiceError
type LnurlSuccessAction = import("@/domain/bitcoin/lnurl").LnurlSuccessAction
type LnurlSuccessActionTag = import("@/domain/bitcoin/lnurl").LnurlSuccessActionTag

type LnurlPayInvoiceResponse = {
  invoice: string
  successAction: LnurlSuccessAction | null
}

interface ILnurlPayService {
  fetchInvoiceFromLnAddressOrLnurl(args: {
    amount: BtcPaymentAmount
    lnAddressOrLnurl: string
  }): Promise<LnurlPayInvoiceResponse | LnurlServiceError>
}
