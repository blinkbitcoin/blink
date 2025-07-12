import { getInvoiceRequestByHash } from "./get-payment-request"

import { RepositoryError } from "@/domain/errors"
import { decodeInvoice } from "@/domain/bitcoin/lightning"
import { LedgerService } from "@/services/ledger"
import { getInvoicePreImageByHash } from "@/app/transactions/get-invoice-preimage-by-hash"

export const PaymentStatusChecker = async (uncheckedPaymentRequest: string) => {
  const decodedInvoice = decodeInvoice(uncheckedPaymentRequest)
  if (decodedInvoice instanceof Error) return decodedInvoice

  const { paymentRequest, paymentHash, expiresAt, isExpired } = decodedInvoice

  return {
    paymentRequest,
    paymentHash,
    expiresAt,
    isExpired,
    invoiceIsPaid: async (): Promise<boolean | RepositoryError> => {
      const ledger = LedgerService()
      const recorded = await ledger.isLnTxRecorded(paymentHash)
      if (recorded instanceof Error) return recorded
      return recorded
    },
    getPreImage: async (): Promise<SecretPreImage | ApplicationError> => {
      return getInvoicePreImageByHash({ paymentHash })
    },
  }
}

export const PaymentStatusCheckerByHash = async ({
  paymentHash,
}: {
  paymentHash: PaymentHash
}) => {
  const paymentRequest = await getInvoiceRequestByHash({ paymentHash })
  if (paymentRequest instanceof Error) return paymentRequest

  return PaymentStatusChecker(paymentRequest)
}
