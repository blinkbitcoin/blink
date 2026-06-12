export * from "./wallet-invoice-checker"

export const WalletInvoiceStatus = {
  Pending: "Pending",
  Paid: "Paid",
  Expired: "Expired",
} as const

export const WalletInvoiceWebhookStatus = {
  Pending: "pending",
  FinalSent: "final_sent",
} as const
