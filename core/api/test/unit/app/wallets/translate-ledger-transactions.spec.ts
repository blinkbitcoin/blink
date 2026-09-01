import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import {
  translateLedgerTransactionEdges,
  translateLedgerTransactions,
} from "@/app/wallets/translate-ledger-transactions"
import { toSats } from "@/domain/bitcoin"
import { getCurrencyMajorExponent, toCents } from "@/domain/fiat"
import {
  InvalidPriceCurrencyError,
  PriceCurrenciesNotAvailableError,
} from "@/domain/price"
import { ErrorLevel, WalletCurrency } from "@/domain/shared"
import { WalletTransactionHistory } from "@/domain/wallets"
import { getNonEndUserWalletIds } from "@/services/ledger"
import { baseLogger } from "@/services/logger"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

jest.mock("@/config", () => ({ memoSharingConfig: {} }))

jest.mock("@/services/price/get-currency-fraction-digits", () => ({
  getCurrencyFractionDigits: jest.fn(),
}))

jest.mock("@/domain/wallets", () => ({
  WalletTransactionHistory: {
    fromLedger: jest.fn(({ txn }) => ({ id: txn.id })),
  },
}))

jest.mock("@/services/ledger", () => ({
  getNonEndUserWalletIds: jest.fn(),
}))

jest.mock("@/services/logger", () => ({
  baseLogger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn() },
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

const mockGetCurrencyFractionDigits = getCurrencyFractionDigits as jest.MockedFunction<
  typeof getCurrencyFractionDigits
>
const mockFromLedger = WalletTransactionHistory.fromLedger as jest.MockedFunction<
  typeof WalletTransactionHistory.fromLedger
>
const mockGetNonEndUserWalletIds = getNonEndUserWalletIds as jest.MockedFunction<
  typeof getNonEndUserWalletIds
>
const mockLoggerWarn = baseLogger.warn as jest.Mock
const mockRecordExceptionInCurrentSpan = recordExceptionInCurrentSpan as jest.Mock

beforeEach(() => {
  mockGetCurrencyFractionDigits.mockResolvedValue(2)
  mockGetNonEndUserWalletIds.mockResolvedValue(
    {} as Awaited<ReturnType<typeof getNonEndUserWalletIds>>,
  )
})

afterEach(() => {
  jest.clearAllMocks()
})

describe("translateLedgerTransactions", () => {
  it("resolves each distinct currency once and supplies its fraction digits", async () => {
    mockGetCurrencyFractionDigits.mockImplementation(async ({ currency }) =>
      currency === "COP" ? 2 : 3,
    )
    const copTransaction = {
      id: "cop-1",
      currency: WalletCurrency.Btc,
      displayCurrency: "COP" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>
    const secondCopTransaction = {
      ...copTransaction,
      id: "cop-2",
    } as LedgerTransaction<WalletCurrency>
    const usdTransaction = {
      id: "usd-1",
      currency: WalletCurrency.Usd,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>

    await translateLedgerTransactions([
      copTransaction,
      secondCopTransaction,
      usdTransaction,
    ])

    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledTimes(2)
    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledWith({ currency: "COP" })
    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledWith({ currency: "USD" })
    expect(mockFromLedger).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        txn: copTransaction,
        displayCurrencyFractionDigits: 2,
      }),
    )
    expect(mockFromLedger).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        txn: usdTransaction,
        displayCurrencyFractionDigits: 3,
      }),
    )
  })

  it("uses persisted precision without querying mutable price configuration", async () => {
    const transaction = {
      id: "cop-1",
      currency: WalletCurrency.Btc,
      displayCurrency: "COP" as DisplayCurrency,
      displayCurrencyFractionDigits: 2,
    } as LedgerTransaction<WalletCurrency>

    await translateLedgerTransactions([transaction])

    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(mockFromLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        txn: transaction,
        displayCurrencyFractionDigits: 2,
      }),
    )
  })

  it("formats pre-Node 24 COP amounts with configured precision", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementationOnce(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transaction = {
      id: "cop-1" as LedgerTransactionId,
      journalId: "journal-1" as LedgerJournalId,
      walletId: "wallet-1" as WalletId,
      type: "type" as LedgerTransactionType,
      timestamp: new Date("2026-07-03T14:22:08Z"),
      pendingConfirmation: false,
      feeKnownInAdvance: true,
      fee: 0,
      feeUsd: 0,
      usd: 0,
      currency: WalletCurrency.Btc,
      credit: toSats(0),
      debit: toSats(496_532),
      satsAmount: toSats(496_532),
      satsFee: toSats(871),
      centsAmount: toCents(0),
      centsFee: toCents(0),
      displayAmount: 103_900_513 as DisplayCurrencyBaseAmount,
      displayFee: 182_259 as DisplayCurrencyBaseAmount,
      displayCurrency: "COP" as DisplayCurrency,
    } as LedgerTransaction<WalletCurrency>

    const result = await translateLedgerTransactions([transaction])

    expect(result[0].settlementDisplayAmount).toBe("-1039005.13")
    expect(result[0].settlementDisplayFee).toBe("1822.59")
  })

  it("keeps the runtime ICU scale for ambiguous rows after the Node 24 release", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementationOnce(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transaction = {
      id: "cop-1" as LedgerTransactionId,
      journalId: "journal-1" as LedgerJournalId,
      walletId: "wallet-1" as WalletId,
      type: "type" as LedgerTransactionType,
      timestamp: new Date("2026-08-04T00:00:00Z"),
      pendingConfirmation: false,
      feeKnownInAdvance: true,
      fee: 0,
      feeUsd: 0,
      usd: 0,
      currency: WalletCurrency.Btc,
      credit: toSats(0),
      debit: toSats(496_532),
      satsAmount: toSats(496_532),
      satsFee: toSats(871),
      centsAmount: toCents(0),
      centsFee: toCents(0),
      displayAmount: 1_039_005 as DisplayCurrencyBaseAmount,
      displayFee: 1_822 as DisplayCurrencyBaseAmount,
      displayCurrency: "COP" as DisplayCurrency,
    } as LedgerTransaction<WalletCurrency>

    const result = await translateLedgerTransactions([transaction])
    const exponent = getCurrencyMajorExponent("COP" as DisplayCurrency)

    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(result[0].settlementDisplayAmount).toBe(
      (-1_039_005 / 10 ** exponent).toFixed(exponent),
    )
    expect(result[0].settlementDisplayFee).toBe(
      (1_822 / 10 ** exponent).toFixed(exponent),
    )
  })

  it("preserves pagination cursors when translating transaction edges", async () => {
    const transaction = {
      id: "cop-1",
      currency: WalletCurrency.Btc,
      displayCurrency: "COP" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>
    const cursor = "cursor-1" as PaginatedQueryCursor

    const edges = await translateLedgerTransactionEdges([{ cursor, node: transaction }])

    expect(edges).toEqual([{ cursor, node: { id: transaction.id } }])
  })

  it("falls back to ICU precision when legacy transaction metadata is unavailable", async () => {
    const error = new PriceCurrenciesNotAvailableError()
    mockGetCurrencyFractionDigits.mockResolvedValueOnce(error)
    const transaction = {
      id: "usd-1",
      currency: WalletCurrency.Usd,
      displayCurrency: "USD" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>

    const result = await translateLedgerTransactionEdges([
      { cursor: "cursor-1" as PaginatedQueryCursor, node: transaction },
    ])

    expect(result).toEqual([
      { cursor: "cursor-1" as PaginatedQueryCursor, node: { id: transaction.id } },
    ])
    expect(mockFromLedger).toHaveBeenCalledWith(
      expect.objectContaining({ displayCurrencyFractionDigits: 2 }),
    )
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error, currency: "USD", fallbackFractionDigits: 2 }),
      "using ICU precision for legacy transaction history",
    )
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error,
      level: ErrorLevel.Warn,
    })
  })

  it("falls back when a legacy currency is missing from price metadata", async () => {
    const error = new InvalidPriceCurrencyError()
    mockGetCurrencyFractionDigits.mockResolvedValueOnce(error)
    const transaction = {
      id: "usd-1",
      currency: WalletCurrency.Usd,
      displayCurrency: "USD" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>

    await translateLedgerTransactions([transaction])

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error, currency: "USD", fallbackFractionDigits: 2 }),
      "using ICU precision for legacy transaction history",
    )
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error,
      level: ErrorLevel.Warn,
    })
  })
})
