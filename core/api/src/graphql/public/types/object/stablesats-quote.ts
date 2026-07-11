import { GT } from "@/graphql"

const StableSatsQuote = GT.Object({
  name: "StableSatsQuote",
  fields: () => ({
    quoteId: {
      type: GT.NonNull(GT.String),
      description: "Unique identifier for the quote",
    },
    amountToSellInSats: {
      type: GT.Int,
      description: "Amount to sell in satoshis (for buy USD quotes)",
    },
    amountToBuyInCents: {
      type: GT.Int,
      description: "Amount to buy in cents (for buy USD quotes)",
    },
    amountToBuyInSats: {
      type: GT.Int,
      description: "Amount to buy in satoshis (for sell USD quotes)",
    },
    amountToSellInCents: {
      type: GT.Int,
      description: "Amount to sell in cents (for sell USD quotes)",
    },
    expiresAt: {
      type: GT.NonNull(GT.Int),
      description: "Quote expiration timestamp",
    },
    executed: {
      type: GT.NonNull(GT.Boolean),
      description: "Whether the quote has been executed",
    },
  }),
})

export default StableSatsQuote
