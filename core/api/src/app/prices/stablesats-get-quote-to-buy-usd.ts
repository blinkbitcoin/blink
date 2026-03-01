import { checkedToBtcPaymentAmount, checkedToUsdPaymentAmount } from "@/domain/shared"
import { QuotesService } from "@/services/quotes"
import type { QuoteToBuyUsd } from "@/domain/quotes/index.types"

export const stableSatsGetQuoteToBuyUsdWithSats = async ({
  btcAmount,
  immediateExecution = false,
}: {
  btcAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToBuyUsd | ApplicationError> => {
  const validatedBtcAmount = checkedToBtcPaymentAmount(btcAmount)
  if (validatedBtcAmount instanceof Error) return validatedBtcAmount

  const quotesService = QuotesService()
  return quotesService.getQuoteToBuyUsdWithSats({
    btcAmount: validatedBtcAmount,
    immediateExecution,
  })
}

export const stableSatsGetQuoteToBuyUsdWithCents = async ({
  usdAmount,
  immediateExecution = false,
}: {
  usdAmount: number
  immediateExecution?: boolean
}): Promise<QuoteToBuyUsd | ApplicationError> => {
  const validatedUsdAmount = checkedToUsdPaymentAmount(usdAmount)
  if (validatedUsdAmount instanceof Error) return validatedUsdAmount

  const quotesService = QuotesService()
  return quotesService.getQuoteToBuyUsdWithCents({
    usdAmount: validatedUsdAmount,
    immediateExecution,
  })
}
