import { checkedToBtcPaymentAmount } from "@/domain/shared"
import { LnurlPayService } from "@/services/lnurl-pay"
import { LnAddressVerifyCache } from "@/services/redis"

export const createInvoiceForLnAddress = async ({
  lnAddress,
  amount: uncheckedAmount,
}: {
  lnAddress: string
  amount: number
}): Promise<LnAddressInvoice | ApplicationError> => {
  const amount = checkedToBtcPaymentAmount(uncheckedAmount)
  if (amount instanceof Error) return amount

  const invoice = await LnurlPayService().createInvoiceForLnAddress({
    amount,
    lnAddress,
  })
  if (invoice instanceof Error) return invoice

  const stored = await LnAddressVerifyCache().store({
    paymentHash: invoice.paymentHash,
    verify: invoice.verify,
  })
  if (stored instanceof Error) return stored

  return invoice
}
