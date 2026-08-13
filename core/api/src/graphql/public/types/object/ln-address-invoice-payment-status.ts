import LnPaymentPreImage from "@/graphql/shared/types/scalar/ln-payment-preimage"
import { GT } from "@/graphql/index"

const LnAddressInvoicePaymentStatus = GT.Object<LnAddressInvoiceStatus>({
  name: "LnAddressInvoicePaymentStatus",
  fields: () => ({
    settled: {
      type: GT.NonNull(GT.Boolean),
      description: "Whether the invoice has been paid.",
    },
    preimage: {
      type: LnPaymentPreImage,
      description: "Payment preimage, present once the invoice is settled.",
    },
  }),
})

export default LnAddressInvoicePaymentStatus
