import { GT } from "@/graphql/index"

const QuoteType = GT.Enum({
  name: "QuoteType",
  values: {
    BUY_USD_WITH_SATS: { value: "BUY_USD_WITH_SATS" },
    BUY_USD_WITH_CENTS: { value: "BUY_USD_WITH_CENTS" },
    SELL_USD_FOR_SATS: { value: "SELL_USD_FOR_SATS" },
    SELL_USD_FOR_CENTS: { value: "SELL_USD_FOR_CENTS" },
  },
})

export default QuoteType
