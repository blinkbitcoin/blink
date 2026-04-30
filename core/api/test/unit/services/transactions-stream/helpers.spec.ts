jest.mock("@/services/ledger/schema", () => ({
  TransactionMetadata: {
    findById: jest.fn(),
  },
}))

jest.mock("@/services/mongoose/schema", () => ({
  WalletInvoice: {
    findById: jest.fn(),
  },
}))

jest.mock("@/services/mongoose/wallets", () => ({
  WalletsRepository: jest.fn(),
}))

import {
  createAccountIdLoader,
  createAccountIdResolver,
  createPreimageLoader,
  createPreimageResolver,
  createTransactionStreamEventMapper,
} from "@/services/transactions-stream/helpers"
import { TransactionMetadata } from "@/services/ledger/schema"

import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
  ledgerTransactionTypeToTransactionsStreamSettlementVia,
} from "@/domain/transactions-stream"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

afterEach(() => {
  jest.clearAllMocks()
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

  it("does not cache unresolved wallet lookups", async () => {
    const loadAccountId = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("account-1")
    const resolveAccountId = createAccountIdResolver({ loadAccountId })

    await expect(resolveAccountId("wallet-1" as WalletId)).resolves.toBeUndefined()
    await expect(resolveAccountId("wallet-1" as WalletId)).resolves.toBe("account-1")

    expect(loadAccountId).toHaveBeenCalledTimes(2)
  })
})

describe("createAccountIdLoader", () => {
  it("propagates wallet repository errors", async () => {
    const lookupError = new Error("wallet lookup failed")
    const findWalletById = jest.fn().mockResolvedValue(lookupError)
    const loadAccountId = createAccountIdLoader({ findWalletById })

    await expect(loadAccountId("wallet-1" as WalletId)).rejects.toBe(lookupError)
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
      loadPreimage({
        transactionId: "tx-1" as LedgerTransactionId,
        paymentHash: "hash-1" as PaymentHash,
      }),
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
      loadPreimage({
        transactionId: "tx-1" as LedgerTransactionId,
        paymentHash: "hash-1" as PaymentHash,
      }),
    ).resolves.toBe("invoice-secret")
    await expect(
      loadPreimage({ transactionId: "tx-2" as LedgerTransactionId }),
    ).resolves.toBe("")
  })
})

describe("createPreimageResolver", () => {
  it("caches preimages by transaction id", async () => {
    const loadPreimage = jest.fn().mockResolvedValue("preimage-1")
    const resolvePreimage = createPreimageResolver({ loadPreimage })

    await expect(
      resolvePreimage({
        transactionId: "tx-1" as LedgerTransactionId,
        paymentHash: "hash-1" as PaymentHash,
      }),
    ).resolves.toBe("preimage-1")
    await expect(
      resolvePreimage({
        transactionId: "tx-1" as LedgerTransactionId,
        paymentHash: "hash-1" as PaymentHash,
      }),
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
      id: "661111111111111111111111" as LedgerTransactionId,
      walletId: "wallet-1" as WalletId,
      paymentHash: "payment-hash-1" as PaymentHash,
      type: LedgerTransactionType.Payment,
      debit: 321 as Satoshis,
      credit: -321 as Satoshis,
      pendingConfirmation: false,
      currency: WalletCurrency.Btc,
      journalId: "journal-1" as LedgerJournalId,
      satsAmount: 321 as Satoshis,
      centsAmount: 654 as UsdCents,
      timestamp: new Date("2024-01-01T00:00:00Z"),
      feeKnownInAdvance: false,
      fee: undefined,
      usd: undefined,
      feeUsd: undefined,
    } as LedgerTransaction<WalletCurrency>

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
      timestamp: new Date("2024-01-01T00:00:00Z"),
    })
  })

  it("skips ledger transactions without a wallet id", async () => {
    const { mapTransactionStreamEvent } = createTransactionStreamEventMapper()

    const ledgerTransaction = {
      id: "661111111111111111111111" as LedgerTransactionId,
      walletId: undefined,
      type: LedgerTransactionType.Payment,
      debit: 0 as Satoshis,
      credit: 1 as Satoshis,
      pendingConfirmation: false,
      currency: WalletCurrency.Btc,
      journalId: "journal-1" as LedgerJournalId,
      timestamp: new Date("2024-01-01T00:00:00Z"),
      feeKnownInAdvance: false,
      fee: undefined,
      usd: undefined,
      feeUsd: undefined,
    } as LedgerTransaction<WalletCurrency>

    await expect(mapTransactionStreamEvent(ledgerTransaction)).resolves.toBeUndefined()
  })

  it("maps transactions with the default preimage resolver after ledger schema is loaded", async () => {
    const findById = TransactionMetadata.findById as jest.Mock
    findById.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    } as never)

    const resolveAccountId = jest.fn().mockResolvedValue("account-1")
    const { mapTransactionStreamEvent } = createTransactionStreamEventMapper({
      resolveAccountId,
    })

    const ledgerTransaction = {
      id: "661111111111111111111111" as LedgerTransactionId,
      walletId: "wallet-1" as WalletId,
      type: LedgerTransactionType.Invoice,
      debit: 0 as Satoshis,
      credit: 100 as Satoshis,
      pendingConfirmation: false,
      currency: WalletCurrency.Btc,
      journalId: "journal-1" as LedgerJournalId,
      satsAmount: 100 as Satoshis,
      centsAmount: 200 as UsdCents,
      timestamp: new Date("2024-01-01T00:00:00Z"),
      feeKnownInAdvance: false,
      fee: undefined,
      usd: undefined,
      feeUsd: undefined,
    } as LedgerTransaction<WalletCurrency>

    await expect(mapTransactionStreamEvent(ledgerTransaction)).resolves.toMatchObject({
      ledgerTransactionId: "661111111111111111111111",
      accountId: "account-1",
      preimage: "",
    })
    expect(findById).toHaveBeenCalledWith("661111111111111111111111")
  })
})
