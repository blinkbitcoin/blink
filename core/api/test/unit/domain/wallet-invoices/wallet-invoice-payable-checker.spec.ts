import { INVOICE_EXPIRATIONS } from "@/domain/bitcoin/lightning/invoice-expiration"
import {
  AlreadyPaidError,
  InvoiceCanceledError,
  InvoiceExpiredError,
} from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"
import { checkWalletInvoiceIsPayable } from "@/domain/wallet-invoices"

const now = new Date("2026-10-10T12:00:00Z")
const usdWindowMs = INVOICE_EXPIRATIONS.USD.max * 1000

const usdInvoice: WalletInvoiceWithOptionalLnInvoice = {
  paymentHash: "paymentHash" as PaymentHash,
  secret: "secretPreImage" as SecretPreImage,
  selfGenerated: true,
  pubkey: "pubkey" as Pubkey,
  recipientWalletDescriptor: {
    id: "walletId" as WalletId,
    accountId: crypto.randomUUID() as AccountId,
    currency: WalletCurrency.Usd,
  },
  paid: false,
  createdAt: new Date(now.getTime() - 60 * 1000),
  processingCompleted: false,
  externalId: "externalId" as LedgerExternalId,
}

const btcInvoice: WalletInvoiceWithOptionalLnInvoice = {
  ...usdInvoice,
  recipientWalletDescriptor: {
    ...usdInvoice.recipientWalletDescriptor,
    currency: WalletCurrency.Btc,
  },
  createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
}

const withLnExpiry = (
  walletInvoice: WalletInvoiceWithOptionalLnInvoice,
  expiresAt: Date,
): WalletInvoiceWithOptionalLnInvoice => ({
  ...walletInvoice,
  lnInvoice: { expiresAt } as LnInvoice,
})

describe("checkWalletInvoiceIsPayable", () => {
  it("accepts an open usd invoice within its quote window", () => {
    expect(checkWalletInvoiceIsPayable(usdInvoice, now)).toBe(true)
  })

  it("rejects a paid invoice", () => {
    expect(
      checkWalletInvoiceIsPayable({ ...usdInvoice, paid: true }, now),
    ).toBeInstanceOf(AlreadyPaidError)
  })

  it("rejects a paid invoice that is also processingCompleted as already paid", () => {
    expect(
      checkWalletInvoiceIsPayable(
        { ...usdInvoice, paid: true, processingCompleted: true },
        now,
      ),
    ).toBeInstanceOf(AlreadyPaidError)
  })

  it("rejects a canceled invoice", () => {
    expect(
      checkWalletInvoiceIsPayable({ ...usdInvoice, processingCompleted: true }, now),
    ).toBeInstanceOf(InvoiceCanceledError)
  })

  it("reports an expired invoice already marked processingCompleted as expired", () => {
    const createdAt = new Date(now.getTime() - usdWindowMs - 1000)
    expect(
      checkWalletInvoiceIsPayable(
        { ...usdInvoice, createdAt, processingCompleted: true },
        now,
      ),
    ).toBeInstanceOf(InvoiceExpiredError)
  })

  it("rejects a usd invoice past its quote window", () => {
    const createdAt = new Date(now.getTime() - usdWindowMs - 1000)
    expect(checkWalletInvoiceIsPayable({ ...usdInvoice, createdAt }, now)).toBeInstanceOf(
      InvoiceExpiredError,
    )
  })

  it("rejects a usd invoice past its ln expiry within the quote window", () => {
    const invoice = withLnExpiry(usdInvoice, new Date(now.getTime() - 1000))
    expect(checkWalletInvoiceIsPayable(invoice, now)).toBeInstanceOf(InvoiceExpiredError)
  })

  it("does not apply the usd quote window to btc invoices", () => {
    expect(checkWalletInvoiceIsPayable(btcInvoice, now)).toBe(true)
  })

  it("accepts a btc invoice before its ln expiry", () => {
    const invoice = withLnExpiry(btcInvoice, new Date(now.getTime() + 1000))
    expect(checkWalletInvoiceIsPayable(invoice, now)).toBe(true)
  })

  it("rejects a btc invoice past its ln expiry", () => {
    const invoice = withLnExpiry(btcInvoice, new Date(now.getTime() - 1000))
    expect(checkWalletInvoiceIsPayable(invoice, now)).toBeInstanceOf(InvoiceExpiredError)
  })
})
