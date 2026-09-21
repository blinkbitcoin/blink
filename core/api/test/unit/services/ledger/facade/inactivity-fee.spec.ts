const mockPersistAndReturnEntry = jest.fn()

jest.mock("@/services/ledger/helpers", () => ({
  ...jest.requireActual("@/services/ledger/helpers"),
  persistAndReturnEntry: (args: unknown) => mockPersistAndReturnEntry(args),
}))

jest.mock("@/services/ledger/facade/static-account-ids", () => ({
  staticAccountIds: async () => ({
    bankOwnerAccountId: "Liabilities:bank-owner",
    dealerBtcAccountId: "Liabilities:dealer-btc",
    dealerUsdAccountId: "Liabilities:dealer-usd",
  }),
}))

jest.mock("@/services/ledger/caching", () => ({
  getBankOwnerWalletId: async () => "bank-owner",
}))

import { Entry, IJournal } from "medici"

import {
  InactivityFeeRefundReason,
  InvalidInactivityFeeExternalIdError,
} from "@/domain/inactivity-fee"
import { LedgerTransactionType } from "@/domain/ledger"
import { ValidationError, WalletCurrency } from "@/domain/shared"

import {
  recordInactivityFee,
  recordInactivityFeeRefund,
} from "@/services/ledger/facade/inactivity-fee"

const btcWalletId = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" as WalletId
const usdWalletId = "11111111-2222-4333-8444-555555555555" as WalletId
const accountId = "account" as AccountId

const btcWallet = { id: btcWalletId, currency: WalletCurrency.Btc, accountId }
const usdWallet = { id: usdWalletId, currency: WalletCurrency.Usd, accountId }

const amount = (sats: bigint, cents: bigint) => ({
  btc: { amount: sats, currency: WalletCurrency.Btc },
  usd: { amount: cents, currency: WalletCurrency.Usd },
})

const feeProvenance = {
  rate: 77566,
  rateSource: "price-service",
  configVersion: "v1",
  noticeId: "notice-1",
  runId: "fee-2026-10-15-x",
}
const refundProvenance = {
  refundReason: InactivityFeeRefundReason.Activity,
  noticeId: "notice-1",
  runId: "reactivation-2026-10-20-x",
}

const key = (value: string) => value as LedgerExternalId

const persistedTransactions = (): ILedgerTransaction[] => {
  expect(mockPersistAndReturnEntry).toHaveBeenCalledTimes(1)
  const { entry } = mockPersistAndReturnEntry.mock.calls[0][0] as {
    entry: Entry<ILedgerTransaction, IJournal>
  }
  return entry.transactions
}

const leg = (txs: ILedgerTransaction[], accounts: string): ILedgerTransaction => {
  const found = txs.find((tx) => tx.accounts === accounts)
  if (!found) throw new Error(`no leg on ${accounts}`)
  return found
}

const expectBalanced = (txs: ILedgerTransaction[]) => {
  for (const currency of [WalletCurrency.Btc, WalletCurrency.Usd]) {
    const legs = txs.filter((tx) => tx.currency === currency)
    const debits = legs.reduce((sum, tx) => sum + tx.debit, 0)
    const credits = legs.reduce((sum, tx) => sum + tx.credit, 0)
    expect(debits).toBe(credits)
  }
}

beforeEach(() => {
  mockPersistAndReturnEntry.mockReset()
  mockPersistAndReturnEntry.mockResolvedValue({ journalId: "journal" })
})

describe("recordInactivityFee", () => {
  it("debits the Bitcoin Balance to bankowner with the key, memo and provenance on every leg", async () => {
    const externalId = key(`ifee_${btcWalletId}_2026-10`)

    const result = await recordInactivityFee({
      walletDescriptor: btcWallet,
      amount: amount(1289n, 100n),
      externalId,
      metadata: feeProvenance,
    })

    expect(result).toEqual({ journalId: "journal" })
    const txs = persistedTransactions()
    expect(txs).toHaveLength(2)
    const user = leg(txs, `Liabilities:${btcWalletId}`)
    expect(user).toEqual(
      expect.objectContaining({
        debit: 1289,
        credit: 0,
        currency: WalletCurrency.Btc,
        type: LedgerTransactionType.InactivityFee,
        external_id: externalId,
        pending: false,
        satsAmount: 1289,
        centsAmount: 100,
        satsFee: 0,
        centsFee: 0,
        memoPayer: "Inactivity fee — $1.00 (1,289 sats at $77,566/BTC)",
        ...feeProvenance,
      }),
    )
    expect(leg(txs, "Liabilities:bank-owner")).toEqual(
      expect.objectContaining({ credit: 1289, debit: 0, external_id: externalId }),
    )
    expectBalanced(txs)
  })

  it("debits the Dollar Balance in cents and balances it through the dealer", async () => {
    const externalId = key(`ifee_${usdWalletId}_2026-10`)

    await recordInactivityFee({
      walletDescriptor: usdWallet,
      amount: amount(773n, 60n),
      externalId,
      metadata: feeProvenance,
    })

    const txs = persistedTransactions()
    expect(txs).toHaveLength(4)
    expect(leg(txs, `Liabilities:${usdWalletId}`)).toEqual(
      expect.objectContaining({
        debit: 60,
        currency: WalletCurrency.Usd,
        memoPayer: "Inactivity fee — $0.60",
      }),
    )
    expect(leg(txs, "Liabilities:bank-owner")).toEqual(
      expect.objectContaining({ credit: 773, currency: WalletCurrency.Btc }),
    )
    expectBalanced(txs)
  })

  it.each([
    ["a refund key", `ifee_refund_${btcWalletId}_2026-10`],
    ["a malformed month", `ifee_${btcWalletId}_2026-13`],
    ["another wallet's key", `ifee_${usdWalletId}_2026-10`],
    ["an unrelated key", "payment-1"],
  ])("refuses %s and posts nothing", async (_label, externalId) => {
    const result = await recordInactivityFee({
      walletDescriptor: btcWallet,
      amount: amount(1289n, 100n),
      externalId: key(externalId),
      metadata: feeProvenance,
    })

    expect(result).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
    expect(result).toBeInstanceOf(ValidationError)
    expect(mockPersistAndReturnEntry).not.toHaveBeenCalled()
  })
})

describe("recordInactivityFeeRefund", () => {
  it("credits the Bitcoin Balance from bankowner with the refund metadata", async () => {
    const externalId = key(`ifee_refund_${btcWalletId}_2026-10`)

    await recordInactivityFeeRefund({
      walletDescriptor: btcWallet,
      amount: amount(1289n, 100n),
      externalId,
      metadata: refundProvenance,
    })

    const txs = persistedTransactions()
    expect(txs).toHaveLength(2)
    expect(leg(txs, `Liabilities:${btcWalletId}`)).toEqual(
      expect.objectContaining({
        credit: 1289,
        debit: 0,
        type: LedgerTransactionType.InactivityFeeRefund,
        external_id: externalId,
        satsAmount: 1289,
        centsAmount: 100,
        memoPayer: "Inactivity fee refund — 1,289 sats",
        refundReason: "activity",
        noticeId: "notice-1",
        runId: "reactivation-2026-10-20-x",
      }),
    )
    expect(leg(txs, "Liabilities:bank-owner")).toEqual(
      expect.objectContaining({ debit: 1289, credit: 0 }),
    )
    expectBalanced(txs)
  })

  it("credits the Dollar Balance the debit's cents, bankowner paying the debit's sats", async () => {
    await recordInactivityFeeRefund({
      walletDescriptor: usdWallet,
      amount: amount(773n, 60n),
      externalId: key(`ifee_refund_${usdWalletId}_2026-09`),
      metadata: { ...refundProvenance, refundReason: InactivityFeeRefundReason.Claims },
    })

    const txs = persistedTransactions()
    expect(txs).toHaveLength(4)
    expect(leg(txs, `Liabilities:${usdWalletId}`)).toEqual(
      expect.objectContaining({
        credit: 60,
        currency: WalletCurrency.Usd,
        memoPayer: "Inactivity fee refund — $0.60",
        refundReason: "claims",
      }),
    )
    expect(leg(txs, "Liabilities:bank-owner")).toEqual(
      expect.objectContaining({ debit: 773, currency: WalletCurrency.Btc }),
    )
    expect(leg(txs, "Liabilities:dealer-btc")).toEqual(
      expect.objectContaining({ credit: 773 }),
    )
    expect(leg(txs, "Liabilities:dealer-usd")).toEqual(
      expect.objectContaining({ debit: 60 }),
    )
    expectBalanced(txs)
  })

  it.each([
    ["a debit key", `ifee_${btcWalletId}_2026-10`],
    ["a malformed month", `ifee_refund_${btcWalletId}_2026-00`],
    ["another wallet's key", `ifee_refund_${usdWalletId}_2026-10`],
  ])("refuses %s and posts nothing", async (_label, externalId) => {
    const result = await recordInactivityFeeRefund({
      walletDescriptor: btcWallet,
      amount: amount(1289n, 100n),
      externalId: key(externalId),
      metadata: refundProvenance,
    })

    expect(result).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
    expect(mockPersistAndReturnEntry).not.toHaveBeenCalled()
  })

  it("returns the ledger's error", async () => {
    const ledgerError = new Error("commit failed")
    mockPersistAndReturnEntry.mockResolvedValue(ledgerError)

    const result = await recordInactivityFeeRefund({
      walletDescriptor: btcWallet,
      amount: amount(1289n, 100n),
      externalId: key(`ifee_refund_${btcWalletId}_2026-10`),
      metadata: refundProvenance,
    })

    expect(result).toBe(ledgerError)
  })
})
