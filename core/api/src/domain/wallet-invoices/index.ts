export * from "./wallet-invoice-checker"

export const WalletInvoiceStatus = {
  Pending: "Pending",
  Paid: "Paid",
  Expired: "Expired",
} as const

export const WalletInvoiceWebhookStatus = {
  Pending: "pending",
  Sent: "sent",
} as const
