import LnAddressInvoice from "../object/ln-address-invoice"

import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"

const LnAddressInvoicePayload = GT.Object({
  name: "LnAddressInvoicePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    invoice: {
      type: LnAddressInvoice,
    },
  }),
})

export default LnAddressInvoicePayload
