import { sendInvoiceWebhook } from "@/app/wallets/send-invoice-webhook"
import { WalletInvoiceWebhookStatus } from "@/domain/wallet-invoices"
import { PaymentStatusCheckerByHash } from "@/app/lightning/payment-status-checker"
import { CallbackService } from "@/services/svix"
import { WalletInvoicesRepository } from "@/services/mongoose"

jest.mock("@/config", () => ({
  getCallbackServiceConfig: jest.fn(() => ({ secret: "secret" })),
}))

jest.mock("@/app/lightning/payment-status-checker", () => ({
  PaymentStatusCheckerByHash: jest.fn(),
}))

jest.mock("@/services/svix", () => ({
  CallbackService: jest.fn(),
}))

jest.mock("@/services/mongoose", () => ({
  WalletInvoicesRepository: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

const paymentHash = "0".repeat(64) as PaymentHash
const paymentRequest = "lnbc1paymentrequest" as EncodedPaymentRequest
const paymentPreimage = "1".repeat(64) as SecretPreImage

const walletInvoice = {
  paymentHash,
  webhookUrl: "https://example.com/webhook",
  webhookStatus: WalletInvoiceWebhookStatus.Pending,
} as WalletInvoiceWithOptionalLnInvoice

const sendInvoiceMessage = jest.fn()
const deleteInvoiceApplication = jest.fn()
const markWebhookAsSent = jest.fn()

beforeEach(() => {
  jest.resetAllMocks()
  ;(CallbackService as jest.Mock).mockReturnValue({
    sendInvoiceMessage,
    deleteInvoiceApplication,
  })
  ;(WalletInvoicesRepository as jest.Mock).mockReturnValue({
    markWebhookAsSent,
  })
  sendInvoiceMessage.mockResolvedValue(true)
  deleteInvoiceApplication.mockResolvedValue(true)
  markWebhookAsSent.mockResolvedValue(walletInvoice)
})

describe("sendInvoiceWebhook", () => {
  it("does not send for pending invoices", async () => {
    ;(PaymentStatusCheckerByHash as jest.Mock).mockResolvedValue({
      paymentRequest,
      isExpired: false,
      invoiceIsPaid: jest.fn().mockResolvedValue(false),
    })

    const result = await sendInvoiceWebhook({ walletInvoice })

    expect(result).toBe(true)
    expect(sendInvoiceMessage).not.toHaveBeenCalled()
    expect(markWebhookAsSent).not.toHaveBeenCalled()
    expect(deleteInvoiceApplication).not.toHaveBeenCalled()
  })

  it("sends paid invoice payload without account-scoped fields", async () => {
    ;(PaymentStatusCheckerByHash as jest.Mock).mockResolvedValue({
      paymentRequest,
      isExpired: false,
      invoiceIsPaid: jest.fn().mockResolvedValue(true),
      getPreImage: jest.fn().mockResolvedValue(paymentPreimage),
    })

    const result = await sendInvoiceWebhook({ walletInvoice })

    expect(result).toBe(true)
    expect(sendInvoiceMessage).toHaveBeenCalledWith({
      paymentHash,
      eventType: "invoice.paid",
      payload: {
        paymentHash,
        paymentRequest,
        status: "PAID",
        paymentPreimage,
      },
    })
    expect(sendInvoiceMessage.mock.calls[0][0].payload).not.toHaveProperty("accountId")
    expect(sendInvoiceMessage.mock.calls[0][0].payload).not.toHaveProperty("walletId")
    expect(sendInvoiceMessage.mock.calls[0][0].payload).not.toHaveProperty("transaction")
    expect(markWebhookAsSent).toHaveBeenCalledWith(paymentHash)
    expect(deleteInvoiceApplication).toHaveBeenCalledWith({ paymentHash })
  })

  it("sends expired invoice payload without preimage", async () => {
    ;(PaymentStatusCheckerByHash as jest.Mock).mockResolvedValue({
      paymentRequest,
      isExpired: true,
      invoiceIsPaid: jest.fn().mockResolvedValue(false),
    })

    const result = await sendInvoiceWebhook({ walletInvoice })

    expect(result).toBe(true)
    expect(sendInvoiceMessage).toHaveBeenCalledWith({
      paymentHash,
      eventType: "invoice.expired",
      payload: {
        paymentHash,
        paymentRequest,
        status: "EXPIRED",
      },
    })
    expect(sendInvoiceMessage.mock.calls[0][0].payload).not.toHaveProperty(
      "paymentPreimage",
    )
    expect(markWebhookAsSent).toHaveBeenCalledWith(paymentHash)
  })
})
