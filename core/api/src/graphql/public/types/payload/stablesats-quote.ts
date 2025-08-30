import IError from "@/graphql/shared/types/abstract/error"
import { GT } from "@/graphql/index"
import StableSatsQuote from "@/graphql/public/types/object/stablesats-quote"

const StableSatsQuotePayload = GT.Object({
  name: "StableSatsQuotePayload",
  fields: () => ({
    errors: {
      type: GT.NonNullList(IError),
    },
    quote: {
      type: StableSatsQuote,
    },
  }),
})

export default StableSatsQuotePayload
