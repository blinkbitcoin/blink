import { InvalidQuoteIdError } from "../errors"

import { QuoteId } from "./index.types"

export * from "./errors"

export const checkedToQuoteId = (quoteId?: string): QuoteId | ValidationError => {
  if (!quoteId || typeof quoteId !== "string") {
    return new InvalidQuoteIdError(quoteId)
  }
  return quoteId as QuoteId
}
