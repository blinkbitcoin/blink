import crypto from "crypto"

import {
  inactivityFeeExternalId,
  inactivityFeeRefundExternalId,
  InactivityFeeRefundReason,
  unpairedDebits,
} from "@/domain/inactivity-fee"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import { MainBook } from "@/services/ledger/books"
import * as LedgerFacade from "@/services/ledger/facade"
import { Transaction, TransactionMetadata } from "@/services/ledger/schema"

import { createMandatoryUsers } from "test/helpers"

const month = "2026-10"

const amount = {
  btc: { amount: 1289n, currency: WalletCurrency.Btc },
  usd: { amount: 100n, currency: WalletCurrency.Usd },
}

const newWallet = (): WalletDescriptor<"BTC"> => ({
  id: crypto.randomUUID() as WalletId,
  currency: WalletCurrency.Btc,
  accountId: crypto.randomUUID() as AccountId,
})

const unwrap = <T>(value: T): Exclude<T, Error> => {
  if (value instanceof Error) throw value
  return value as Exclude<T, Error>
}

const recordFee = async (wallet: WalletDescriptor<"BTC">) =>
  unwrap(
    await LedgerFacade.recordInactivityFee({
      walletDescriptor: wallet,
      amount,
      externalId: unwrap(inactivityFeeExternalId({ walletId: wallet.id, month })),
      metadata: {
        rate: 77566,
        rateSource: "dealer-mid",
        configVersion: "test",
        noticeId: "notice-1",
        runId: "fee-2026-10-15-test",
      },
    }),
  )

const recordRefund = async (wallet: WalletDescriptor<"BTC">) =>
  unwrap(
    await LedgerFacade.recordInactivityFeeRefund({
      walletDescriptor: wallet,
      amount,
      externalId: unwrap(inactivityFeeRefundExternalId({ walletId: wallet.id, month })),
      metadata: {
        refundReason: InactivityFeeRefundReason.Activity,
        noticeId: "notice-1",
        runId: "reactivation-2026-10-20-test",
      },
    }),
  )

const walletRows = (wallet: WalletDescriptor<"BTC">) =>
  Transaction.find({ accounts: `Liabilities:${wallet.id}` })

const scan = async (wallet: WalletDescriptor<"BTC">) =>
  unwrap(await LedgerService().listInactivityFeeTransactionsByWalletId(wallet.id))

beforeAll(async () => {
  await createMandatoryUsers()
})

afterEach(async () => {
  await Transaction.deleteMany({})
  await TransactionMetadata.deleteMany({})
})

describe("listInactivityFeeTransactionsByWalletId", () => {
  it("returns a live fee and its refund", async () => {
    const wallet = newWallet()
    await recordFee(wallet)
    await recordRefund(wallet)

    const rows = await scan(wallet)

    expect(rows.map(({ type }) => type).sort()).toEqual(
      [
        LedgerTransactionType.InactivityFee,
        LedgerTransactionType.InactivityFeeRefund,
      ].sort(),
    )
    expect(unpairedDebits({ transactions: rows })).toEqual({
      unpaired: [],
      malformed: [],
    })
  })

  it("drops a voided fee and its reversal, which keeps the fee's key and type", async () => {
    const wallet = newWallet()
    const fee = await recordFee(wallet)
    await MainBook.void(fee.journalId, "test void")

    // the reversal is what a voided-only filter used to let through
    const raw = await walletRows(wallet)
    expect(raw).toHaveLength(2)
    const reversal = raw.find((row) => !row.voided)
    expect(reversal).toEqual(
      expect.objectContaining({
        type: LedgerTransactionType.InactivityFee,
        external_id: unwrap(inactivityFeeExternalId({ walletId: wallet.id, month })),
      }),
    )
    expect(reversal?._original_journal).toBeDefined()

    const rows = await scan(wallet)

    expect(rows).toEqual([])
    expect(unpairedDebits({ transactions: rows })).toEqual({
      unpaired: [],
      malformed: [],
    })
  })

  it("drops a voided refund and its reversal, leaving the debit unpaired", async () => {
    const wallet = newWallet()
    const fee = await recordFee(wallet)
    const refund = await recordRefund(wallet)
    await MainBook.void(refund.journalId, "test void")

    const rows = await scan(wallet)

    expect(rows).toHaveLength(1)
    expect(rows[0].journalId).toBe(fee.journalId)
    const { unpaired, malformed } = unpairedDebits({ transactions: rows })
    expect(malformed).toEqual([])
    expect(unpaired.map(({ refundExternalId }) => refundExternalId)).toEqual([
      unwrap(inactivityFeeRefundExternalId({ walletId: wallet.id, month })),
    ])
  })

  it("pairs a fee re-posted under the key a void freed as one unpaired debit", async () => {
    const wallet = newWallet()
    const voided = await recordFee(wallet)
    await MainBook.void(voided.journalId, "test void")
    const reposted = await recordFee(wallet)

    const rows = await scan(wallet)

    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe(LedgerTransactionType.InactivityFee)
    expect(rows[0].journalId).toBe(reposted.journalId)
    const { unpaired, malformed } = unpairedDebits({ transactions: rows })
    expect(malformed).toEqual([])
    expect(unpaired).toHaveLength(1)
  })
})
