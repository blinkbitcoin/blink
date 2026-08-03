jest.mock("@/services/ledger/books", () => ({
  MainBook: { balance: jest.fn() },
  MainBookAdmin: {},
  Transaction: {},
  TransactionMetadata: {},
}))

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
  wrapAsyncFunctionsToRunInSpan: ({ fns }: { fns: Record<string, unknown> }) => fns,
}))

import { BigIntFloatConversionError, ErrorLevel, WalletCurrency } from "@/domain/shared"
import { LedgerService } from "@/services/ledger"
import { MainBook } from "@/services/ledger/books"
import * as caching from "@/services/ledger/caching"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockBalance = MainBook.balance as jest.Mock
const mockRecordException = recordExceptionInCurrentSpan as jest.Mock

describe("getWalletBalanceAmount", () => {
  const bankOwnerWalletId = "bankOwnerWalletId" as WalletId
  const bankOwnerWalletDescriptor = {
    id: bankOwnerWalletId,
    currency: WalletCurrency.Btc,
    accountId: "bankOwnerAccountId" as AccountId,
  }
  const userWalletDescriptor = {
    id: "userWalletId" as WalletId,
    currency: WalletCurrency.Btc,
    accountId: "userAccountId" as AccountId,
  }
  const ledgerService = LedgerService()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns UnknownLedgerError when the bankowner resolver rejects on a fractional balance", async () => {
    jest.resetModules()
    const freshCaching = await import("@/services/ledger/caching")
    const freshBooks = await import("@/services/ledger/books")
    const freshErrors = await import("@/domain/ledger/errors")
    const freshLedger = await import("@/services/ledger")
    freshCaching.setBankOwnerWalletResolver(() =>
      Promise.reject(new Error("resolver failed")),
    )
    ;(freshBooks.MainBook.balance as jest.Mock).mockResolvedValue({ balance: 99.99 })

    const result = await freshLedger
      .LedgerService()
      .getWalletBalanceAmount(bankOwnerWalletDescriptor)

    expect(result).toBeInstanceOf(freshErrors.UnknownLedgerError)
  })

  it("records a fractional bankowner balance at warn and returns the floored amount", async () => {
    caching.setBankOwnerWalletResolver(() => Promise.resolve(bankOwnerWalletId))
    mockBalance.mockResolvedValue({ balance: 99.99 })

    const result = await ledgerService.getWalletBalanceAmount(bankOwnerWalletDescriptor)

    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(BigIntFloatConversionError),
        level: ErrorLevel.Warn,
        attributes: { "error.message": "Inconsistent float balance from db: 99.99" },
      }),
    )
    expect(mockRecordException).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ amount: 99n, currency: WalletCurrency.Btc })
  })

  it("records a fractional non-bankowner balance at critical and returns the floored amount", async () => {
    caching.setBankOwnerWalletResolver(() => Promise.resolve(bankOwnerWalletId))
    mockBalance.mockResolvedValue({ balance: 99.99 })

    const result = await ledgerService.getWalletBalanceAmount(userWalletDescriptor)

    expect(mockRecordException).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(BigIntFloatConversionError),
        level: ErrorLevel.Critical,
        attributes: { "error.message": "Inconsistent float balance from db: 99.99" },
      }),
    )
    expect(mockRecordException).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ amount: 99n, currency: WalletCurrency.Btc })
  })

  it("records nothing and returns the exact amount for an integer bankowner balance", async () => {
    mockBalance.mockResolvedValue({ balance: 100 })

    const result = await ledgerService.getWalletBalanceAmount(bankOwnerWalletDescriptor)

    expect(mockRecordException).not.toHaveBeenCalled()
    expect(result).toEqual({ amount: 100n, currency: WalletCurrency.Btc })
  })
})
