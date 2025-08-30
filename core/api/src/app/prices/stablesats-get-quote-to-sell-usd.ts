import { checkedToBtcPaymentAmount, checkedToUsdPaymentAmount } from "@/domain/shared"
import { DealerQuoteService } from "@/services/dealer-quote"
import type { QuoteToSellUsd } from "@/domain/dealer-quote/index.types"

export const getStableSatsQuoteToSellUsdWithSats = async ({
  btcAmount,
  immediateExecution = false,
}: {
  btcAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToSellUsd | ApplicationError> => {
  const validatedBtcAmount = checkedToBtcPaymentAmount(btcAmount)
  if (validatedBtcAmount instanceof Error) return validatedBtcAmount

  const dealerQuoteService = DealerQuoteService()
  const result = await dealerQuoteService.getQuoteToSellUsdWithSats(
    validatedBtcAmount,
    immediateExecution,
  )

  return result
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

  const dealerQuoteService = DealerQuoteService()
  const result = await dealerQuoteService.getQuoteToSellUsdWithCents(
    validatedUsdAmount,
    immediateExecution,
  )

  return result
}
