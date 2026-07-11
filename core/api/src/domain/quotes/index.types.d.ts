type QuotesServiceError = import("./errors").QuotesServiceError

type QuoteId = string & { readonly brand: unique symbol }

export interface IQuotesService {
  getQuoteToBuyUsdWithSats({
    btcAmount,
    immediateExecution,
  }: {
    btcAmount: BtcPaymentAmount
    immediateExecution?: boolean
  }): Promise<QuoteToBuyUsd | QuotesServiceError>
  getQuoteToBuyUsdWithCents({
    usdAmount,
    immediateExecution,
  }: {
    usdAmount: UsdPaymentAmount
    immediateExecution?: boolean
  }): Promise<QuoteToBuyUsd | QuotesServiceError>

  getQuoteToSellUsdWithSats({
    btcAmount,
    immediateExecution,
  }: {
    btcAmount: BtcPaymentAmount
    immediateExecution?: boolean
  }): Promise<QuoteToSellUsd | QuotesServiceError>

  getQuoteToSellUsdWithCents({
    usdAmount,
    immediateExecution,
  }: {
    usdAmount: UsdPaymentAmount
    immediateExecution?: boolean
  }): Promise<QuoteToSellUsd | QuotesServiceError>

  acceptQuote(quoteId: QuoteId): Promise<true | QuotesServiceError>
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
