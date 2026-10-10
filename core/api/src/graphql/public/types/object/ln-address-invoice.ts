import LnPaymentRequest from "@/graphql/shared/types/scalar/ln-payment-request"
import PaymentHash from "@/graphql/shared/types/scalar/payment-hash"
import { GT } from "@/graphql/index"

const LnAddressInvoice = GT.Object<LnAddressInvoice>({
  name: "LnAddressInvoice",
  fields: () => ({
    paymentRequest: {
      type: GT.NonNull(LnPaymentRequest),
      description: "BOLT-11 payment request to be paid to the lightning address.",
    },
    paymentHash: {
      type: GT.NonNull(PaymentHash),
    },
    verify: {
      type: GT.NonNull(GT.String),
      description:
        "LUD-21 verify url. Prefer the lnAddressInvoicePaymentStatus query with the paymentHash to check settlement.",
    },
  }),
})

export default LnAddressInvoice
