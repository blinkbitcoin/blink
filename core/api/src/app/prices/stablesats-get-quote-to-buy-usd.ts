import { checkedToBtcPaymentAmount, checkedToUsdPaymentAmount } from "@/domain/shared"
import { DealerQuoteService } from "@/services/dealer-quote"
import type { QuoteToBuyUsd } from "@/domain/dealer-quote/index.types"

export const getStableSatsQuoteToBuyUsdWithSats = async ({
  btcAmount,
  immediateExecution = false,
}: {
  btcAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToBuyUsd | ApplicationError> => {
  const validatedBtcAmount = checkedToBtcPaymentAmount(btcAmount)
  if (validatedBtcAmount instanceof Error) return validatedBtcAmount

  const dealerQuoteService = DealerQuoteService()
  const result = await dealerQuoteService.getQuoteToBuyUsdWithSats(
    validatedBtcAmount,
    immediateExecution,
  )

  return result
}

export const getStableSatsQuoteToBuyUsdWithCents = async ({
  usdAmount,
  immediateExecution = false,
}: {
  usdAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToBuyUsd | ApplicationError> => {
  const validatedUsdAmount = checkedToUsdPaymentAmount(usdAmount)
  if (validatedUsdAmount instanceof Error) return validatedUsdAmount

  const dealerQuoteService = DealerQuoteService()
  const result = await dealerQuoteService.getQuoteToBuyUsdWithCents(
    validatedUsdAmount,
    immediateExecution,
  )

  return result
}
