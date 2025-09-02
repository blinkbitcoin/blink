import { checkedToBtcPaymentAmount, checkedToUsdPaymentAmount } from "@/domain/shared"
import { QuotesService } from "@/services/quotes"
import type { QuoteToSellUsd } from "@/domain/quotes/index.types"

export const getStableSatsQuoteToSellUsdWithSats = async ({
  btcAmount,
  immediateExecution = false,
}: {
  btcAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToSellUsd | ApplicationError> => {
  const validatedBtcAmount = checkedToBtcPaymentAmount(btcAmount)
  if (validatedBtcAmount instanceof Error) return validatedBtcAmount

  const quotesService = QuotesService()
  return quotesService.getQuoteToSellUsdWithSats({
    btcAmount: validatedBtcAmount,
    immediateExecution,
  })
}

export const getStableSatsQuoteToSellUsdWithCents = async ({
  usdAmount,
  immediateExecution = false,
}: {
  usdAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToSellUsd | ApplicationError> => {
  const validatedUsdAmount = checkedToUsdPaymentAmount(usdAmount)
  if (validatedUsdAmount instanceof Error) return validatedUsdAmount

  const quotesService = QuotesService()
  return quotesService.getQuoteToSellUsdWithCents({
    usdAmount: validatedUsdAmount,
    immediateExecution,
  })
}
