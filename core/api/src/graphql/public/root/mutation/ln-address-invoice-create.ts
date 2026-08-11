import dedent from "dedent"

import { Lnurl } from "@/app"

import { GT } from "@/graphql/index"
import SatAmount from "@/graphql/shared/types/scalar/sat-amount"
import LnAddressInvoicePayload from "@/graphql/public/types/payload/ln-address-invoice"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const LnAddressInvoiceCreateInput = GT.Input({
  name: "LnAddressInvoiceCreateInput",
  fields: () => ({
    lnAddress: {
      type: GT.NonNull(GT.String),
      description: "Blink lightning address to create an invoice for (user@domain).",
    },
    amount: { type: GT.NonNull(SatAmount), description: "Amount in satoshis." },
  }),
})

const LnAddressInvoiceCreateMutation = GT.Field<
  null,
  GraphQLPublicContextAuth,
  {
    input: {
      lnAddress: string | InputValidationError
      amount: Satoshis | InputValidationError
    }
  }
>({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(LnAddressInvoicePayload),
  description: dedent`Returns a lightning invoice for a Blink lightning address.
  Works for both custodial and non-custodial (Spark) recipients.
  Use lnAddressInvoicePaymentStatus with the returned paymentHash to check settlement.`,
  args: {
    input: { type: GT.NonNull(LnAddressInvoiceCreateInput) },
  },
  resolve: async (_, args) => {
    const { lnAddress, amount } = args.input

    if (lnAddress instanceof Error) {
      return { errors: [{ message: lnAddress.message }] }
    }
    if (amount instanceof Error) {
      return { errors: [{ message: amount.message }] }
    }

    const invoice = await Lnurl.createInvoiceForLnAddress({ lnAddress, amount })

    if (invoice instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(invoice)] }
    }

    return {
      errors: [],
      invoice,
    }
  },
})

export default LnAddressInvoiceCreateMutation
