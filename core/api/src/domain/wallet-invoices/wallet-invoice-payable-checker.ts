import { isUsdQuoteWindowClosed } from "./wallet-invoice-checker"
import { WalletInvoiceStatusChecker } from "./wallet-invoice-status-checker"

import { WalletInvoiceStatus } from "./wallet-invoice-status"

import {
  AlreadyPaidError,
  InvoiceCanceledError,
  InvoiceExpiredError,
} from "@/domain/errors"

const hasLnInvoice = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
): walletInvoice is WalletInvoice => walletInvoice.lnInvoice !== undefined

export const checkWalletInvoiceIsPayable = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
  now: Date = new Date(),
): true | AlreadyPaidError | InvoiceExpiredError | InvoiceCanceledError => {
  const { paymentHash } = walletInvoice

  if (walletInvoice.paid) return new AlreadyPaidError(paymentHash)

  // Expiry first: the pending-invoice job also marks expired invoices processingCompleted
  if (isUsdQuoteWindowClosed(walletInvoice, now)) {
    return new InvoiceExpiredError(paymentHash)
  }

  if (
    hasLnInvoice(walletInvoice) &&
    WalletInvoiceStatusChecker(walletInvoice).status(now) === WalletInvoiceStatus.Expired
  ) {
    return new InvoiceExpiredError(paymentHash)
  }

  if (walletInvoice.processingCompleted) return new InvoiceCanceledError(paymentHash)

  return true
}
