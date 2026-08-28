import { GT } from "@/graphql/index"
import PaymentHash from "@/graphql/shared/types/scalar/payment-hash"

const LnAddressInvoicePaymentStatusInput = GT.Input({
  name: "LnAddressInvoicePaymentStatusInput",
  fields: () => ({
    paymentHash: {
      type: GT.NonNull(PaymentHash),
      description: "Payment hash of the invoice created via lnAddressInvoiceCreate.",
    },
  }),
})

export default LnAddressInvoicePaymentStatusInput
