import { WalletCurrency } from "@/domain/shared"
import { toSats } from "@/domain/bitcoin"
import { centsToDollars, toCents } from "@/domain/fiat"

import { TWILIO_WELCOME_CONTENT_SID } from "@/config"

export const welcomeSmsTemplate = ({
  amount,
  currency,
  phoneNumber,
}: WelcomeTemplateParams): SmsTemplateResponse => {
  const currencyAmount =
    currency === WalletCurrency.Btc
      ? Number(toSats(amount))
      : centsToDollars(Number(toCents(amount)))

  const formattedAmount =
    currency === WalletCurrency.Btc
      ? `${currencyAmount} SAT`
      : `$${currencyAmount.toFixed(2)}`

  return {
    contentSid: TWILIO_WELCOME_CONTENT_SID || "",
    contentVariables: {
      formattedAmount,
      phoneNumber,
    },
  }
}
