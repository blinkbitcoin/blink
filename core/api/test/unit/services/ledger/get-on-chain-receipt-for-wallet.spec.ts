jest.mock("@/services/ledger/books", () => ({
  MainBook: {},
  MainBookAdmin: {},
  Transaction: { findOne: jest.fn() },
  TransactionMetadata: {},
}))

jest.mock("@/services/ledger/admin", () => ({ admin: {} }))
jest.mock("@/services/ledger/admin-legacy", () => ({}))
jest.mock("@/services/ledger/paginated-ledger", () => ({
  paginatedLedger: jest.fn(),
}))
jest.mock("@/services/ledger/send", () => ({ send: {} }))
jest.mock("@/services/ledger/services", () => ({
  TransactionsMetadataRepository: jest.fn(() => ({
    updateByHash: jest.fn(),
  })),
}))

jest.mock("@/services/ledger/translate", () => ({
  translateToLedgerTx: jest.fn(),
  translateToLedgerTxWithMetadata: jest.fn(),
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: Record<string, unknown> }) => fns,
}))

import { UnknownLedgerError } from "@/domain/ledger/errors"
import { LedgerTransactionType, toLiabilitiesWalletId } from "@/domain/ledger"
import { LedgerService } from "@/services/ledger"
import { Transaction } from "@/services/ledger/books"
import { translateToLedgerTx } from "@/services/ledger/translate"

const mockFindOne = Transaction.findOne as jest.Mock
const mockTranslateToLedgerTx = translateToLedgerTx as jest.Mock

describe("getOnChainReceiptForWallet", () => {
  const walletId = "wallet-id" as WalletId
  const txHash = "tx-hash" as OnChainTxHash
  const vout = 2 as OnChainTxVout
  const ledgerService = LedgerService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns the translated receipt for the exact wallet outpoint", async () => {
    const entry = { id: "ledger-entry" }
    const receipt = { id: "translated-receipt" }
    mockFindOne.mockResolvedValue(entry)
    mockTranslateToLedgerTx.mockReturnValue(receipt)

    const result = await ledgerService.getOnChainReceiptForWallet({
      walletId,
      txHash,
      vout,
    })

    expect(mockFindOne).toHaveBeenCalledWith({
      accounts: toLiabilitiesWalletId(walletId),
      type: LedgerTransactionType.OnchainReceipt,
      hash: txHash,
      vout,
    })
    expect(mockTranslateToLedgerTx).toHaveBeenCalledWith(entry)
    expect(result).toBe(receipt)
  })

  it("returns undefined when no matching receipt exists", async () => {
    mockFindOne.mockResolvedValue(null)

    const result = await ledgerService.getOnChainReceiptForWallet({
      walletId,
      txHash,
      vout,
    })

    expect(result).toBeUndefined()
    expect(mockTranslateToLedgerTx).not.toHaveBeenCalled()
  })

  it("returns UnknownLedgerError when the lookup fails", async () => {
    mockFindOne.mockRejectedValue(new Error("database unavailable"))

    const result = await ledgerService.getOnChainReceiptForWallet({
      walletId,
      txHash,
      vout,
    })

    expect(result).toBeInstanceOf(UnknownLedgerError)
  })
})

describe("getTransactionForWalletByExternalId", () => {
  const walletId = "wallet-id" as WalletId
  const externalId = "post_migration_sweep" as LedgerExternalId
  const ledgerService = LedgerService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns the translated transaction for the wallet and external id", async () => {
    const entry = { id: "ledger-entry" }
    const translated = { id: "translated-entry" }
    mockFindOne.mockResolvedValue(entry)
    mockTranslateToLedgerTx.mockReturnValue(translated)

    expect(
      await ledgerService.getTransactionForWalletByExternalId({
        walletId,
        externalId,
      }),
    ).toBe(translated)
    expect(mockFindOne).toHaveBeenCalledWith({
      accounts: toLiabilitiesWalletId(walletId),
      external_id: externalId,
    })
  })

  it("returns undefined when the external id is absent", async () => {
    mockFindOne.mockResolvedValue(null)

    expect(
      await ledgerService.getTransactionForWalletByExternalId({
        walletId,
        externalId,
      }),
    ).toBeUndefined()
  })

  it("returns UnknownLedgerError when the lookup fails", async () => {
    mockFindOne.mockRejectedValue(new Error("database unavailable"))

    expect(
      await ledgerService.getTransactionForWalletByExternalId({
        walletId,
        externalId,
      }),
    ).toBeInstanceOf(UnknownLedgerError)
  })
})
