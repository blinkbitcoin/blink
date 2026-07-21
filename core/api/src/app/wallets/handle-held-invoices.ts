import { declineHeldInvoice } from "./decline-single-pending-invoice"

import { updatePendingInvoice } from "./update-single-pending-invoice"

import {
  checkReceiveAllowed,
  isReceiveEnforcementArmed,
} from "@/app/wind-down/check-receive-allowed"

import { AccountsRepository, WalletInvoicesRepository } from "@/services/mongoose"

import { runInParallel } from "@/utils"
import { WalletInvoiceChecker } from "@/domain/wallet-invoices"
import { ReceiveDisabledError } from "@/domain/wind-down"

const receiveRefusedForWindDown = async (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
): Promise<boolean | ApplicationError> => {
  if (!isReceiveEnforcementArmed()) return false

  const account = await AccountsRepository().findById(
    walletInvoice.recipientWalletDescriptor.accountId,
  )
  if (account instanceof Error) return account

  const receiveAllowed = await checkReceiveAllowed({ account })
  if (receiveAllowed instanceof ReceiveDisabledError) return true
  if (receiveAllowed instanceof Error) return receiveAllowed

  return false
}

const routeHeldInvoice = async ({
  walletInvoice,
  logger,
}: {
  walletInvoice: WalletInvoiceWithOptionalLnInvoice
  logger: Logger
}): Promise<boolean | ApplicationError> => {
  if (WalletInvoiceChecker(walletInvoice).shouldDecline()) {
    return declineHeldInvoice({ walletInvoice, logger })
  }

  const refused = await receiveRefusedForWindDown(walletInvoice)
  // an errored check must neither settle nor decline: returning it leaves the invoice
  // pending for the next sweep
  if (refused instanceof Error) return refused
  if (refused) return declineHeldInvoice({ walletInvoice, logger })

  return updatePendingInvoice({ walletInvoice, logger })
}

export const handleHeldInvoices = async (logger: Logger): Promise<void> => {
  const pendingInvoices = WalletInvoicesRepository().yieldPending()
  if (pendingInvoices instanceof Error) {
    logger.error(
      { error: pendingInvoices },
      "finish updating pending invoices with error",
    )
    return
  }

  await runInParallel({
    iterator: pendingInvoices,
    logger,
    processor: async (
      walletInvoice: WalletInvoiceWithOptionalLnInvoice,
      index: number,
    ) => {
      logger.trace("updating pending invoices %s in worker %d", index)

      return routeHeldInvoice({ walletInvoice, logger })
    },
  })

  logger.info("finish updating pending invoices")
}

export const handleHeldInvoiceByPaymentHash = async ({
  paymentHash,
  logger,
}: {
  paymentHash: PaymentHash
  logger: Logger
}): Promise<boolean | ApplicationError> => {
  const walletInvoice = await WalletInvoicesRepository().findByPaymentHash(paymentHash)
  if (walletInvoice instanceof Error) return walletInvoice

  return routeHeldInvoice({ walletInvoice, logger })
}
