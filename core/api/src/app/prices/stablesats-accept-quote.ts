import { checkedToQuoteId } from "@/domain/quotes"
import { QuotesService } from "@/services/quotes"

export const stableSatsAcceptQuote = async ({
  quoteId,
}: {
  quoteId: string
}): Promise<true | ApplicationError> => {
  const checkedQuoteId = checkedToQuoteId(quoteId)

  if (checkedQuoteId instanceof Error) return checkedQuoteId

  const quotesService = QuotesService()
  return quotesService.acceptQuote(checkedQuoteId)
}
