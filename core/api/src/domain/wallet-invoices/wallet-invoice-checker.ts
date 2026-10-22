import { invoiceExpirationForCurrency } from "@/domain/bitcoin/lightning"
import { CouldNotFindWalletInvoiceError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

export const usdQuoteExpiresAt = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
): Date => invoiceExpirationForCurrency(WalletCurrency.Usd, walletInvoice.createdAt)

export const isUsdQuoteWindowClosed = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
  now: Date,
): boolean => {
  if (walletInvoice.recipientWalletDescriptor.currency !== WalletCurrency.Usd) {
    return false
  }

  return usdQuoteExpiresAt(walletInvoice).getTime() < now.getTime()
}

export const WalletInvoiceChecker = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice | RepositoryError,
): WalletInvoiceChecker => {
  const shouldDecline = (): boolean => {
    if (walletInvoice instanceof CouldNotFindWalletInvoiceError) {
      return true
    }

    if (walletInvoice instanceof Error) {
      return false
    }

    return isUsdQuoteWindowClosed(walletInvoice, new Date())
  }

  return { shouldDecline }
}
