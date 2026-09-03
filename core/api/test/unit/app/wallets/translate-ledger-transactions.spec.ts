import { getCurrencyFractionDigits } from "@/services/price/get-currency-fraction-digits"
import {
  translateLedgerTransactionEdges,
  translateLedgerTransactions,
} from "@/app/wallets/translate-ledger-transactions"
import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
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

const displayTransaction = ({
  id,
  currency,
  timestamp,
  displayAmount,
  displayFee,
  fractionDigits,
}: {
  id: string
  currency: DisplayCurrency
  timestamp: string
  displayAmount: number
  displayFee: number
  fractionDigits?: number | null
}) =>
  ({
    id: id as LedgerTransactionId,
    journalId: "journal-1" as LedgerJournalId,
    walletId: "wallet-1" as WalletId,
    type: "type" as LedgerTransactionType,
    timestamp: new Date(timestamp),
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
    displayAmount: displayAmount as DisplayCurrencyBaseAmount,
    displayFee: displayFee as DisplayCurrencyBaseAmount,
    displayCurrency: currency,
    displayCurrencyFractionDigits: fractionDigits,
  }) as LedgerTransaction<WalletCurrency>

beforeEach(() => {
  mockGetCurrencyFractionDigits.mockResolvedValue(2)
  mockFromLedger.mockImplementation(({ txn }) => ({ id: txn.id }) as WalletTransaction)
  mockGetNonEndUserWalletIds.mockResolvedValue(
    {} as Awaited<ReturnType<typeof getNonEndUserWalletIds>>,
  )
})

afterEach(() => {
  jest.clearAllMocks()
})

describe("translateLedgerTransactions", () => {
  it("resolves each distinct affected currency once and supplies its fraction digits", async () => {
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
    const pkrTransaction = {
      id: "pkr-1",
      currency: WalletCurrency.Usd,
      displayCurrency: "PKR" as DisplayCurrency,
      timestamp: new Date("2026-07-03T00:00:00Z"),
    } as LedgerTransaction<WalletCurrency>

    await translateLedgerTransactions([
      copTransaction,
      secondCopTransaction,
      pkrTransaction,
    ])

    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledTimes(2)
    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledWith({ currency: "COP" })
    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledWith({ currency: "PKR" })
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
        txn: pkrTransaction,
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

  it("treats a persisted null precision as missing legacy metadata", async () => {
    const transaction = displayTransaction({
      id: "cop-null-precision",
      currency: "COP" as DisplayCurrency,
      timestamp: "2026-07-03T14:22:08Z",
      displayAmount: 103_900_513,
      displayFee: 182_259,
      fractionDigits: null,
    })

    await translateLedgerTransactions([transaction])

    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledWith({ currency: "COP" })
    expect(mockFromLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        txn: transaction,
        displayCurrencyFractionDigits: 2,
      }),
    )
  })

  it("formats every CLDR 48 changed currency with its legacy precision", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transactions = ["COP", "HUF", "IDR", "PKR"].map((currency) =>
      displayTransaction({
        id: currency.toLowerCase(),
        currency: currency as DisplayCurrency,
        timestamp: "2026-07-03T14:22:08Z",
        displayAmount: 103_900_513,
        displayFee: 182_259,
      }),
    )

    const result = await translateLedgerTransactions(transactions)

    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.59",
      "1822.59",
      "1822.59",
      "1822.59",
    ])
  })

  it("uses legacy precision only before the first ICU 48 pod served", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transactions = [
      displayTransaction({
        id: "before",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-08-31T14:11:13.999Z",
        displayAmount: 103_900_513,
        displayFee: 182_259,
      }),
      displayTransaction({
        id: "exact",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-08-31T14:11:14.000Z",
        displayAmount: 1_039_005,
        displayFee: 1_822,
      }),
      displayTransaction({
        id: "after",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-08-31T14:11:14.001Z",
        displayAmount: 1_039_005,
        displayFee: 1_822,
      }),
    ]

    const result = await translateLedgerTransactions(transactions)

    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledTimes(1)
    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.13",
      "-1039005",
      "-1039005",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.59",
      "1822",
      "1822",
    ])
  })

  it("uses durable precision for both runtimes inside the rollout overlap", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transactions = [
      displayTransaction({
        id: "old-runtime",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-08-31T14:11:30Z",
        displayAmount: 103_900_500,
        displayFee: 182_200,
        fractionDigits: 2,
      }),
      displayTransaction({
        id: "new-runtime",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-08-31T14:11:30Z",
        displayAmount: 1_039_005,
        displayFee: 1_822,
        fractionDigits: 0,
      }),
    ]

    const result = await translateLedgerTransactions(transactions)

    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.00",
      "-1039005",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.00",
      "1822",
    ])
  })

  it("does not apply configured precision to a currency unchanged by ICU 48", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementationOnce(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transaction = displayTransaction({
      id: "xts-1",
      currency: "XTS" as DisplayCurrency,
      timestamp: "2026-07-03T14:22:08Z",
      displayAmount: 1_039_005,
      displayFee: 1_822,
    })

    const result = await translateLedgerTransactions([transaction])

    expect(mockGetCurrencyFractionDigits).not.toHaveBeenCalled()
    expect(result[0].settlementDisplayAmount).toBe("-10390.05")
    expect(result[0].settlementDisplayFee).toBe("18.22")
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

  it("uses immutable legacy precision when price metadata is unavailable", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const error = new PriceCurrenciesNotAvailableError()
    mockGetCurrencyFractionDigits.mockResolvedValue(error)
    const transactions = ["COP", "HUF", "IDR", "PKR"].map((currency) =>
      displayTransaction({
        id: currency.toLowerCase(),
        currency: currency as DisplayCurrency,
        timestamp: "2026-07-03T14:22:08Z",
        displayAmount: 103_900_513,
        displayFee: 182_259,
      }),
    )

    const result = await translateLedgerTransactions(transactions)

    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.59",
      "1822.59",
      "1822.59",
      "1822.59",
    ])
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error, currency: "COP", fallbackFractionDigits: 2 }),
      "using fallback precision for legacy transaction history",
    )
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error,
      level: ErrorLevel.Warn,
    })
  })

  it("uses immutable legacy precision when a legacy currency is missing from metadata", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const error = new InvalidPriceCurrencyError()
    mockGetCurrencyFractionDigits.mockResolvedValue(error)
    const transactions = ["COP", "HUF", "IDR", "PKR"].map((currency) =>
      displayTransaction({
        id: currency.toLowerCase(),
        currency: currency as DisplayCurrency,
        timestamp: "2026-07-03T14:22:08Z",
        displayAmount: 103_900_513,
        displayFee: 182_259,
      }),
    )

    const result = await translateLedgerTransactions(transactions)

    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
      "-1039005.13",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.59",
      "1822.59",
      "1822.59",
      "1822.59",
    ])
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ error, currency: "IDR", fallbackFractionDigits: 2 }),
      "using fallback precision for legacy transaction history",
    )
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error,
      level: ErrorLevel.Warn,
    })
  })

  it("does not leak legacy precision onto a post-cutoff row in the same page", async () => {
    const actualWalletsDomain =
      jest.requireActual<typeof import("@/domain/wallets")>("@/domain/wallets")
    mockFromLedger.mockImplementation(
      actualWalletsDomain.WalletTransactionHistory.fromLedger,
    )
    const transactions = [
      displayTransaction({
        id: "eligible",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-07-03T14:22:08Z",
        displayAmount: 103_900_513,
        displayFee: 182_259,
      }),
      displayTransaction({
        id: "post-cutoff",
        currency: "COP" as DisplayCurrency,
        timestamp: "2026-09-01T00:00:00Z",
        displayAmount: 1_039_005,
        displayFee: 1_822,
      }),
    ]

    const result = await translateLedgerTransactions(transactions)

    expect(mockGetCurrencyFractionDigits).toHaveBeenCalledTimes(1)
    expect(result.map(({ settlementDisplayAmount }) => settlementDisplayAmount)).toEqual([
      "-1039005.13",
      "-1039005",
    ])
    expect(result.map(({ settlementDisplayFee }) => settlementDisplayFee)).toEqual([
      "1822.59",
      "1822",
    ])
  })
})
