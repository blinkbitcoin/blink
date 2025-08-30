import { QuoteId } from "@/domain/dealer-quote/index.types"
import { DealerQuoteService } from "@/services/dealer-quote"

export const acceptStableSatsQuote = async ({
  quoteId,
}: {
  quoteId: QuoteId
}): Promise<true | ApplicationError> => {
  if (!quoteId || typeof quoteId !== "string") {
    return new Error("Invalid quote ID provided")
  }

  const dealerQuoteService = DealerQuoteService()
  const result = await dealerQuoteService.acceptQuote(quoteId)

  if (result instanceof Error) return result

  return true
}
