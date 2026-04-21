import mongoose from "mongoose"

import {
  createAccountIdResolver,
  createPreimageLoader,
  createPreimageResolver,
  createTransactionStreamEventMapper,
  parseWalletId,
} from "@/services/transactions-stream/helpers"

import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
  ledgerTransactionTypeToTransactionsStreamSettlementVia,
} from "@/domain/transactions-stream"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

describe("parseWalletId", () => {
  it("returns the wallet id for liabilities accounts", () => {
    expect(parseWalletId("Liabilities:wallet-123")).toBe("wallet-123")
  })

  it("returns undefined for non-liabilities accounts", () => {
    expect(parseWalletId("Assets:wallet-123")).toBeUndefined()
  })
})

describe("mapLedgerTransactionTypeToSettlementVia", () => {
  it("maps ledger types to the expected settlement enum", () => {
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.Invoice,
      ),
    ).toBe(TransactionsStreamSettlementVia.Lightning)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.LnIntraLedger,
      ),
    ).toBe(TransactionsStreamSettlementVia.Intraledger)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.OnchainPayment,
      ),
    ).toBe(TransactionsStreamSettlementVia.Onchain)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(LedgerTransactionType.Fee),
    ).toBe(TransactionsStreamSettlementVia.Unspecified)
  })
})

describe("createAccountIdResolver", () => {
  it("caches wallet lookups", async () => {
    const loadAccountId = jest.fn().mockResolvedValue("account-1")
    const resolveAccountId = createAccountIdResolver({ loadAccountId })

    await expect(resolveAccountId("wallet-1" as WalletId)).resolves.toBe("account-1")
    await expect(resolveAccountId("wallet-1" as WalletId)).resolves.toBe("account-1")

    expect(loadAccountId).toHaveBeenCalledTimes(1)
  })
})

describe("createPreimageLoader", () => {
  it("prefers transaction metadata before falling back to invoices", async () => {
    const findTransactionMetadataById = jest
      .fn()
      .mockResolvedValue({ revealedPreImage: "revealed-preimage" })
    const findWalletInvoiceById = jest.fn()

    const loadPreimage = createPreimageLoader({
      findTransactionMetadataById,
      findWalletInvoiceById,
    })

    await expect(
      loadPreimage({ transactionId: "tx-1", paymentHash: "hash-1" }),
    ).resolves.toBe("revealed-preimage")
    expect(findWalletInvoiceById).not.toHaveBeenCalled()
  })

  it("falls back to the invoice secret and then an empty string", async () => {
    const findTransactionMetadataById = jest.fn().mockResolvedValue(null)
    const findWalletInvoiceById = jest
      .fn()
      .mockResolvedValueOnce({ secret: "invoice-secret" })
      .mockResolvedValueOnce(null)

    const loadPreimage = createPreimageLoader({
      findTransactionMetadataById,
      findWalletInvoiceById,
    })

    await expect(
      loadPreimage({ transactionId: "tx-1", paymentHash: "hash-1" }),
    ).resolves.toBe("invoice-secret")
    await expect(loadPreimage({ transactionId: "tx-2" })).resolves.toBe("")
  })
})

describe("createPreimageResolver", () => {
  it("caches preimages by transaction id", async () => {
    const loadPreimage = jest.fn().mockResolvedValue("preimage-1")
    const resolvePreimage = createPreimageResolver({ loadPreimage })

    await expect(
      resolvePreimage({ transactionId: "tx-1", paymentHash: "hash-1" }),
    ).resolves.toBe("preimage-1")
    await expect(
      resolvePreimage({ transactionId: "tx-1", paymentHash: "hash-1" }),
    ).resolves.toBe("preimage-1")

    expect(loadPreimage).toHaveBeenCalledTimes(1)
  })
})

describe("createTransactionStreamEventMapper", () => {
  it("maps ledger transactions into transaction stream events", async () => {
    const resolveAccountId = jest.fn().mockResolvedValue("account-1")
    const resolvePreimage = jest.fn().mockResolvedValue("preimage-1")
    const { mapTransactionStreamEvent } = createTransactionStreamEventMapper({
      resolveAccountId,
      resolvePreimage,
    })

    const ledgerTransaction = {
      _id: new mongoose.Types.ObjectId("661111111111111111111111"),
      accounts: "Liabilities:wallet-1",
      hash: "payment-hash-1",
      type: LedgerTransactionType.Payment,
      pending: false,
      currency: WalletCurrency.Btc,
      satsAmount: 321,
      centsAmount: 654,
      credit: -321,
      datetime: new Date("2024-01-01T00:00:05Z"),
      timestamp: new Date("2024-01-01T00:00:00Z"),
    }

    const event = await mapTransactionStreamEvent(ledgerTransaction)

    expect(event).toEqual({
      ledgerTransactionId: "661111111111111111111111",
      walletId: "wallet-1",
      accountId: "account-1",
      paymentHash: "payment-hash-1",
      preimage: "preimage-1",
      satsAmount: 321,
      centsAmount: 654,
      currency: WalletCurrency.Btc,
      type: TransactionsStreamTransactionType.Sent,
      settlementVia: TransactionsStreamSettlementVia.Lightning,
      pending: false,
      timestamp: new Date("2024-01-01T00:00:05Z"),
    })
  })
})
