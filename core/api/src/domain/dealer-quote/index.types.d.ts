type DealerQuoteServiceError = import("./errors").DealerQuoteServiceError

type QuoteId = string & { readonly brand: unique symbol }

export interface IDealerQuoteService {
  getQuoteToBuyUsdWithSats(
    btcAmount: BtcPaymentAmount,
    immediateExecution?: boolean,
  ): Promise<QuoteToBuyUsd | DealerQuoteServiceError>
  getQuoteToBuyUsdWithCents(
    usdAmount: UsdPaymentAmount,
    immediateExecution?: boolean,
  ): Promise<QuoteToBuyUsd | DealerQuoteServiceError>

  getQuoteToSellUsdWithSats(
    btcAmount: BtcPaymentAmount,
    immediateExecution?: boolean,
  ): Promise<QuoteToSellUsd | DealerQuoteServiceError>

  getQuoteToSellUsdWithCents(
    usdAmount: UsdPaymentAmount,
    immediateExecution?: boolean,
  ): Promise<QuoteToSellUsd | DealerQuoteServiceError>

  acceptQuote(quoteId: QuoteId): Promise<void | DealerQuoteServiceError>
}

export type QuoteToBuyUsd = {
  quoteId: QuoteId
  amountToSellInSats: number
  amountToBuyInCents: number
  expiresAt: number
  executed: boolean
}

export type QuoteToSellUsd = {
  quoteId: QuoteId
  amountToBuyInSats: number
  amountToSellInCents: number
  expiresAt: number
  executed: boolean
}
