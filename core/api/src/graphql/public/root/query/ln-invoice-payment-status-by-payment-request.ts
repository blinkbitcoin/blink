import { Lightning } from "@/app"
import { WalletInvoiceStatus } from "@/domain/wallet-invoices"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import LnInvoicePaymentStatus from "@/graphql/public/types/object/ln-invoice-payment-status"
import LnInvoicePaymentStatusByPaymentRequestInput from "@/graphql/public/types/object/ln-invoice-payment-status-by-payment-request-input"

const LnInvoicePaymentStatusByPaymentRequestQuery = GT.Field({
  type: GT.NonNull(LnInvoicePaymentStatus),
  args: {
    input: { type: GT.NonNull(LnInvoicePaymentStatusByPaymentRequestInput) },
  },
  resolve: async (_, args) => {
    const { paymentRequest } = args.input
    if (paymentRequest instanceof Error) throw paymentRequest

    const paymentStatusChecker = await Lightning.PaymentStatusChecker(paymentRequest)
    if (paymentStatusChecker instanceof Error) {
      throw mapError(paymentStatusChecker)
    }

    const paid = await paymentStatusChecker.invoiceIsPaid()
    if (paid instanceof Error) {
      throw mapError(paid)
    }

    const { paymentHash, isExpired } = paymentStatusChecker

    if (paid) {
      const preimage = await paymentStatusChecker.getPreImage()
      if (preimage instanceof Error) {
        throw mapError(preimage)
      }
      return {
        paymentHash,
        paymentRequest,
        status: WalletInvoiceStatus.Paid,
        paymentPreimage: preimage,
      }
    }

    const status = isExpired ? WalletInvoiceStatus.Expired : WalletInvoiceStatus.Pending
    return { paymentHash, paymentRequest, status }
  },
})

export default LnInvoicePaymentStatusByPaymentRequestQuery
