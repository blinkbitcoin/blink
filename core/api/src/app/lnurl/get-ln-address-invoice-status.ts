import { CouldNotFindError } from "@/domain/errors"
import { LnAddressInvoiceStatusNotFoundError } from "@/domain/bitcoin/lnurl/errors"
import { LnurlPayService } from "@/services/lnurl-pay"
import { LnAddressVerifyCache } from "@/services/redis"

export const getLnAddressInvoiceStatus = async (
  paymentHash: PaymentHash,
): Promise<LnAddressInvoiceStatus | ApplicationError> => {
  const verify = await LnAddressVerifyCache().findByPaymentHash(paymentHash)
  if (verify instanceof CouldNotFindError) {
    return new LnAddressInvoiceStatusNotFoundError()
  }
  if (verify instanceof Error) return verify

  return LnurlPayService().checkInvoiceStatusFromVerifyUrl(verify)
}
