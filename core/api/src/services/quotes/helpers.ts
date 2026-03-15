import {
  GetQuoteToBuyUsdResponse,
  GetQuoteToSellUsdResponse,
} from "./proto/services/quotes/v1/quote_service_pb"

import { QuoteToBuyUsd, QuoteToSellUsd } from "@/domain/quotes/index.types"

export const convertGetQuoteToBuyUsdResponse = (
  response: GetQuoteToBuyUsdResponse,
): QuoteToBuyUsd => {
  const responseObj = response.toObject()

  return {
    quoteId: responseObj.quoteId as QuoteToBuyUsd["quoteId"],
    amountToSellInSats: responseObj.amountToSellInSats,
    amountToBuyInCents: responseObj.amountToBuyInCents,
    expiresAt: responseObj.expiresAt,
    executed: responseObj.executed,
  }
}

export const convertGetQuoteToSellUsdResponse = (
  response: GetQuoteToSellUsdResponse,
): QuoteToSellUsd => {
  const responseObj = response.toObject()

  return {
    quoteId: responseObj.quoteId as QuoteToSellUsd["quoteId"],
    amountToBuyInSats: responseObj.amountToBuyInSats,
    amountToSellInCents: responseObj.amountToSellInCents,
    expiresAt: responseObj.expiresAt,
    executed: responseObj.executed,
  }
}
