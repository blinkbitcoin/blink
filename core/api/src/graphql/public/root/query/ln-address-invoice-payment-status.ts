import { Lnurl } from "@/app"

import { GT } from "@/graphql/index"
import { mapError } from "@/graphql/error-map"
import LnAddressInvoicePaymentStatus from "@/graphql/public/types/object/ln-address-invoice-payment-status"
import LnAddressInvoicePaymentStatusInput from "@/graphql/public/types/object/ln-address-invoice-payment-status-input"

const LnAddressInvoicePaymentStatusQuery = GT.Field({
  type: GT.NonNull(LnAddressInvoicePaymentStatus),
  args: {
    input: { type: GT.NonNull(LnAddressInvoicePaymentStatusInput) },
  },
  resolve: async (_, args) => {
    const { paymentHash } = args.input
    if (paymentHash instanceof Error) throw paymentHash

    const status = await Lnurl.getLnAddressInvoiceStatus(paymentHash)
    if (status instanceof Error) {
      throw mapError(status)
    }

    return status
  },
})

export default LnAddressInvoicePaymentStatusQuery
