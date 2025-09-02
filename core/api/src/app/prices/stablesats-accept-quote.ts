import { QuoteId } from "@/domain/quotes/index.types"
import { QuotesService } from "@/services/quotes"

export const acceptStableSatsQuote = async ({
  quoteId,
}: {
  quoteId: QuoteId
}): Promise<true | ApplicationError> => {
  if (!quoteId || typeof quoteId !== "string") {
    return new Error("Invalid quote ID provided")
  }

  const quotesService = QuotesService()
  return quotesService.acceptQuote(quoteId)
}
