import dedent from "dedent"

import StableSatsGetQuoteInput from "@/graphql/public/types/object/stablesats-get-quote-input"

import {
  stableSatsGetQuoteToBuyUsdWithSats,
  stableSatsGetQuoteToBuyUsdWithCents,
} from "@/app/prices/stablesats-get-quote-to-buy-usd"
import {
  stableSatsGetQuoteToSellUsdWithSats,
  stableSatsGetQuoteToSellUsdWithCents,
} from "@/app/prices/stablesats-get-quote-to-sell-usd"

import { GT } from "@/graphql/index"
import StableSatsQuotePayload from "@/graphql/public/types/payload/stablesats-quote"
import { mapAndParseErrorForGqlResponse } from "@/graphql/error-map"

const StableSatsGetQuoteQuery = GT.Field({
  extensions: {
    complexity: 120,
  },
  type: GT.NonNull(StableSatsQuotePayload),
  description: dedent`Get a StableSats quote for buying or selling USD.
  Returns a quote with pricing and expiration information.`,
  args: {
    input: { type: GT.NonNull(StableSatsGetQuoteInput) },
  },
  resolve: async (_, args) => {
    const { quoteType, satAmount, centAmount } = args.input

    // Validate input parameters
    for (const input of [quoteType, satAmount, centAmount]) {
      if (input instanceof Error) {
        return { errors: [{ message: input.message }] }
      }
    }

    let result

    switch (quoteType) {
      case "BUY_USD_WITH_SATS":
        if (!satAmount) {
          return { errors: [{ message: "satAmount is required for BUY_USD_WITH_SATS" }] }
        }
        result = await stableSatsGetQuoteToBuyUsdWithSats({
          btcAmount: satAmount,
          immediateExecution: false,
        })
        break

      case "BUY_USD_WITH_CENTS":
        if (!centAmount) {
          return {
            errors: [{ message: "centAmount is required for BUY_USD_WITH_CENTS" }],
          }
        }
        result = await stableSatsGetQuoteToBuyUsdWithCents({
          usdAmount: centAmount,
          immediateExecution: false,
        })
        break

      case "SELL_USD_FOR_SATS":
        if (!satAmount) {
          return { errors: [{ message: "satAmount is required for SELL_USD_FOR_SATS" }] }
        }
        result = await stableSatsGetQuoteToSellUsdWithSats({
          btcAmount: satAmount,
          immediateExecution: false,
        })
        break

      case "SELL_USD_FOR_CENTS":
        if (!centAmount) {
          return {
            errors: [{ message: "centAmount is required for SELL_USD_FOR_CENTS" }],
          }
        }
        result = await stableSatsGetQuoteToSellUsdWithCents({
          usdAmount: centAmount,
          immediateExecution: false,
        })
        break

      default:
        return { errors: [{ message: "Invalid quote type" }] }
    }

    if (result instanceof Error) {
      return { errors: [mapAndParseErrorForGqlResponse(result)] }
    }

    return {
      errors: [],
      quote: result,
    }
  },
})

export default StableSatsGetQuoteQuery
