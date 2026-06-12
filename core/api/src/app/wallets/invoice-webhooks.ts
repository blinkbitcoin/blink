import { getCallbackServiceConfig } from "@/config"
import { PaymentStatusCheckerByHash } from "@/app/lightning/payment-status-checker"
import {
  WalletInvoiceStatus,
  WalletInvoiceWebhookStatus,
} from "@/domain/wallet-invoices"
import { WalletInvoicesRepository } from "@/services/mongoose"
import { CallbackService } from "@/services/svix"
import { baseLogger } from "@/services/logger"

const invoiceWebhookEventType = (status: WalletInvoiceStatus) =>
  `invoice.${status.toLowerCase()}`

const invoiceWebhookStatus = (status: WalletInvoiceStatus) => status.toUpperCase()

const terminalInvoiceWebhookPayload = async (paymentHash: PaymentHash) => {
  const paymentStatusChecker = await PaymentStatusCheckerByHash({ paymentHash })
  if (paymentStatusChecker instanceof Error) return paymentStatusChecker

  const paid = await paymentStatusChecker.invoiceIsPaid()
  if (paid instanceof Error) return paid

  const { paymentRequest, isExpired } = paymentStatusChecker

  if (paid) {
    const paymentPreimage = await paymentStatusChecker.getPreImage()
    if (paymentPreimage instanceof Error) return paymentPreimage

    return {
      paymentHash,
      paymentRequest,
      status: invoiceWebhookStatus(WalletInvoiceStatus.Paid),
      paymentPreimage,
    }
  }

  if (!isExpired) return undefined

  return {
    paymentHash,
    paymentRequest,
    status: invoiceWebhookStatus(WalletInvoiceStatus.Expired),
  }
}

export const sendTerminalInvoiceWebhook = async ({
  walletInvoice,
  logger = baseLogger,
}: {
  walletInvoice: WalletInvoiceWithOptionalLnInvoice
  logger?: Logger
}): Promise<true | ApplicationError> => {
  const { paymentHash, webhookStatus, webhookUrl } = walletInvoice
  if (!webhookUrl || webhookStatus !== WalletInvoiceWebhookStatus.Pending) return true

  const payload = await terminalInvoiceWebhookPayload(paymentHash)
  if (payload instanceof Error) return payload
  if (!payload) return true

  const callbackService = CallbackService(getCallbackServiceConfig())
  const sent = await callbackService.sendInvoiceMessage({
    paymentHash,
    eventType: invoiceWebhookEventType(
      payload.status === invoiceWebhookStatus(WalletInvoiceStatus.Paid)
        ? WalletInvoiceStatus.Paid
        : WalletInvoiceStatus.Expired,
    ),
    payload,
  })
  if (sent instanceof Error) return sent

  const marked = await WalletInvoicesRepository().markWebhookFinalSent(paymentHash)
  if (marked instanceof Error) return marked

  const deleted = await callbackService.deleteInvoiceApplication(paymentHash)
  if (deleted instanceof Error) {
    logger.warn({ err: deleted, paymentHash }, "Unable to delete invoice webhook app")
  }

  return true
}

export const sendPendingTerminalInvoiceWebhooks = async ({
  logger = baseLogger,
}: {
  logger?: Logger
} = {}): Promise<true | ApplicationError> => {
  const pendingWebhooks = WalletInvoicesRepository().yieldPendingWebhooks()
  if (pendingWebhooks instanceof Error) return pendingWebhooks

  for await (const walletInvoice of pendingWebhooks) {
    const result = await sendTerminalInvoiceWebhook({ walletInvoice, logger })
    if (result instanceof Error) {
      logger.error(
        { err: result, paymentHash: walletInvoice.paymentHash },
        "Unable to send terminal invoice webhook",
      )
    }
  }

  return true
}
