import QuoteType from "@/graphql/public/types/scalar/quote-type"
import CentAmount from "@/graphql/public/types/scalar/cent-amount"
import SatAmount from "@/graphql/shared/types/scalar/sat-amount"

import { GT } from "@/graphql"

const StableSatsGetQuoteInput = GT.Input({
  name: "StableSatsGetQuoteInput",
  fields: () => ({
    quoteType: {
      type: GT.NonNull(QuoteType),
      description: "Type of quote to request",
    },
    satAmount: {
      type: SatAmount,
      description: "Amount in satoshis (for sat-based quotes)",
    },
    centAmount: {
      type: CentAmount,
      description: "Amount in cents (for cent-based quotes)",
    },
    immediateExecution: {
      type: GT.Boolean,
      description: "Whether to execute the quote immediately",
      defaultValue: false,
    },
  }),
})

export default StableSatsGetQuoteInput
