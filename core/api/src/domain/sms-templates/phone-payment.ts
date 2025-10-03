import { WalletCurrency } from "@/domain/shared"
import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"

import { TWILIO_PHONE_PAYMENT_CONTENT_SID } from "@/config"

export const phonePaymentSmsTemplate = ({
  amount,
  currency,
  phoneNumber,
}: PhonePaymentTemplateParams): SmsTemplateResponse => {
  const currencyAmount =
    currency === WalletCurrency.Btc
      ? Number(toSats(amount))
      : Number(toCents(amount)) / 100

  const formattedAmount =
    currency === WalletCurrency.Btc
      ? `${currencyAmount} SAT`
      : `$${currencyAmount.toFixed(2)}`

  return {
    contentSid: TWILIO_PHONE_PAYMENT_CONTENT_SID || "",
    contentVariables: {
      formattedAmount,
      phoneNumber,
    },
  }
}
