type LnurlServiceError = import("@/domain/bitcoin/lnurl/errors").LnurlServiceError

type LnAddressInvoice = {
  paymentRequest: EncodedPaymentRequest
  paymentHash: PaymentHash
  verify: string
}

type LnAddressInvoiceStatus = {
  settled: boolean
  preimage: RevealedPreImage | null
}

interface ILnAddressVerifyCache {
  store(args: {
    paymentHash: PaymentHash
    verify: string
  }): Promise<true | RepositoryError>
  findByPaymentHash(paymentHash: PaymentHash): Promise<string | RepositoryError>
}

interface ILnurlPayService {
  fetchInvoiceFromLnAddressOrLnurl(args: {
    amount: BtcPaymentAmount
    lnAddressOrLnurl: string
  }): Promise<string | LnurlServiceError>

  createInvoiceForLnAddress(args: {
    amount: BtcPaymentAmount
    lnAddress: string
  }): Promise<LnAddressInvoice | LnurlServiceError>

  checkInvoiceStatusFromVerifyUrl(
    verify: string,
  ): Promise<LnAddressInvoiceStatus | LnurlServiceError>
}
