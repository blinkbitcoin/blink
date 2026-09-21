import {
  checkedToInactivityFeeExternalId,
  claimsRunId,
  inactivityFeeExternalId,
  InactivityFeeExternalIdKind,
  inactivityFeeMemo,
  inactivityFeeMonthKey,
  inactivityFeeRefundExternalId,
  inactivityFeeRefundMemo,
  InvalidInactivityFeeExternalIdError,
  monthKeyFromExternalId,
  reactivationRunId,
  unpairedDebits,
} from "@/domain/inactivity-fee"
import { LedgerTransactionType, checkedToLedgerExternalId } from "@/domain/ledger"
import { ValidationError, WalletCurrency } from "@/domain/shared"

const walletId = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d" as WalletId
const otherWalletId = "11111111-2222-4333-8444-555555555555" as WalletId

let nextId = 0
const tx = (args: {
  type: LedgerTransactionType
  externalId: string | undefined
  wallet?: WalletId | undefined
  satsAmount?: number
  centsAmount?: number
}): LedgerTransaction<WalletCurrency> => {
  const { type, externalId, satsAmount = 1289, centsAmount = 100 } = args
  // an explicit undefined is a row with no wallet, not the default
  const wallet = "wallet" in args ? args.wallet : walletId
  nextId += 1
  const isDebit = type === LedgerTransactionType.InactivityFee
  return {
    id: `tx-${nextId}` as LedgerTransactionId,
    walletId: wallet,
    type,
    debit: (isDebit ? satsAmount : 0) as Satoshis,
    credit: (isDebit ? 0 : satsAmount) as Satoshis,
    currency: WalletCurrency.Btc,
    timestamp: new Date("2026-10-15T00:00:00Z"),
    pendingConfirmation: false,
    journalId: `journal-${nextId}` as LedgerJournalId,
    externalId: externalId as LedgerExternalId | undefined,
    feeKnownInAdvance: false,
    satsAmount: satsAmount as Satoshis,
    centsAmount: centsAmount as UsdCents,
    fee: undefined,
    usd: undefined,
    feeUsd: undefined,
  }
}

const fee = (month: string) =>
  tx({
    type: LedgerTransactionType.InactivityFee,
    externalId: `ifee_${walletId}_${month}`,
  })
const refund = (month: string) =>
  tx({
    type: LedgerTransactionType.InactivityFeeRefund,
    externalId: `ifee_refund_${walletId}_${month}`,
  })

describe("inactivity fee external ids", () => {
  it("builds the debit and refund keys for a wallet and month", () => {
    expect(inactivityFeeExternalId({ walletId, month: "2026-10" })).toBe(
      `ifee_${walletId}_2026-10`,
    )
    expect(inactivityFeeRefundExternalId({ walletId, month: "2026-10" })).toBe(
      `ifee_refund_${walletId}_2026-10`,
    )
  })

  it("builds keys the ledger's own external id check accepts", () => {
    const key = inactivityFeeRefundExternalId({ walletId, month: "2026-10" })
    if (key instanceof Error) throw key
    expect(checkedToLedgerExternalId(key)).toBe(key)
  })

  it("takes the month from a date in UTC", () => {
    expect(inactivityFeeMonthKey({ date: new Date("2026-10-31T23:59:59Z") })).toBe(
      "2026-10",
    )
    expect(inactivityFeeMonthKey({ date: new Date("2026-11-01T00:30:00+02:00") })).toBe(
      "2026-10",
    )
  })

  it.each(["2026-13", "2026-00", "2026-1", "26-10", "2026-10-15", ""])(
    "refuses the month %p",
    (month) => {
      const key = inactivityFeeExternalId({ walletId, month })
      expect(key).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
      expect(key).toBeInstanceOf(ValidationError)
    },
  )

  it("reads the month back from either kind of key", () => {
    expect(monthKeyFromExternalId({ externalId: `ifee_${walletId}_2026-08` })).toBe(
      "2026-08",
    )
    expect(
      monthKeyFromExternalId({ externalId: `ifee_refund_${walletId}_2026-09` }),
    ).toBe("2026-09")
    expect(monthKeyFromExternalId({ externalId: "payment_123" })).toBeInstanceOf(
      InvalidInactivityFeeExternalIdError,
    )
  })

  describe("checkedToInactivityFeeExternalId", () => {
    const { Fee, Refund } = InactivityFeeExternalIdKind

    it("accepts a key of the asked kind for the given wallet", () => {
      const debitKey = `ifee_${walletId}_2026-10`
      const refundKey = `ifee_refund_${walletId}_2026-10`
      expect(
        checkedToInactivityFeeExternalId({ externalId: debitKey, kind: Fee, walletId }),
      ).toBe(debitKey)
      expect(
        checkedToInactivityFeeExternalId({
          externalId: refundKey,
          kind: Refund,
          walletId,
        }),
      ).toBe(refundKey)
    })

    it("never reads a refund key as a debit key, or the reverse", () => {
      expect(
        checkedToInactivityFeeExternalId({
          externalId: `ifee_refund_${walletId}_2026-10`,
          kind: Fee,
        }),
      ).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
      expect(
        checkedToInactivityFeeExternalId({
          externalId: `ifee_${walletId}_2026-10`,
          kind: Refund,
        }),
      ).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
    })

    it("refuses another wallet's key", () => {
      expect(
        checkedToInactivityFeeExternalId({
          externalId: `ifee_${otherWalletId}_2026-10`,
          kind: Fee,
          walletId,
        }),
      ).toBeInstanceOf(InvalidInactivityFeeExternalIdError)
    })

    it.each([
      `ifee_${walletId}`,
      `ifee_${walletId}_2026-13`,
      `ifee_${walletId}_2026-10_extra`,
      `IFEE_${walletId}_2026-10`,
      `fee_${walletId}_2026-10`,
      `ifee__2026-10`,
    ])("refuses the shape %p", (externalId) => {
      expect(checkedToInactivityFeeExternalId({ externalId, kind: Fee })).toBeInstanceOf(
        InvalidInactivityFeeExternalIdError,
      )
    })
  })
})

describe("unpairedDebits", () => {
  it("returns nothing for a wallet with no fee rows", () => {
    expect(unpairedDebits({ transactions: [] })).toEqual({ unpaired: [], malformed: [] })
  })

  it("returns a debit with no refund, keyed on the debit's month", () => {
    const debit = fee("2026-10")

    expect(unpairedDebits({ transactions: [debit] })).toEqual({
      unpaired: [
        {
          debit,
          walletId,
          month: "2026-10",
          refundExternalId: `ifee_refund_${walletId}_2026-10`,
        },
      ],
      malformed: [],
    })
  })

  it("returns nothing once every debit has its pair", () => {
    const transactions = [
      fee("2026-08"),
      refund("2026-08"),
      fee("2026-09"),
      refund("2026-09"),
    ]

    expect(unpairedDebits({ transactions }).unpaired).toEqual([])
  })

  it("finds every unrefunded month, however old, next to refunded ones", () => {
    const transactions = [
      fee("2024-01"),
      fee("2026-08"),
      refund("2026-08"),
      fee("2026-09"),
    ]

    expect(unpairedDebits({ transactions }).unpaired.map(({ month }) => month)).toEqual([
      "2024-01",
      "2026-09",
    ])
  })

  it("pairs by key only: a refund of another month does not cover the debit", () => {
    const transactions = [fee("2026-09"), refund("2026-08")]

    expect(unpairedDebits({ transactions }).unpaired.map(({ month }) => month)).toEqual([
      "2026-09",
    ])
  })

  it("ignores notice and run ids when pairing", () => {
    const debit = { ...fee("2026-09"), noticeId: "notice-a", runId: "fee-run" }
    const paired = { ...refund("2026-09"), noticeId: "notice-b", runId: "other-run" }

    expect(unpairedDebits({ transactions: [debit, paired] }).unpaired).toEqual([])
  })

  it("refunds the first of two fee rows under one key and hands the second back", () => {
    const first = fee("2026-09")
    const second = fee("2026-09")

    expect(unpairedDebits({ transactions: [first, second] })).toEqual({
      unpaired: [expect.objectContaining({ debit: first })],
      malformed: [second],
    })
  })

  it("hands a repeated fee row back even when the key is already refunded", () => {
    const second = fee("2026-09")

    expect(
      unpairedDebits({ transactions: [fee("2026-09"), refund("2026-09"), second] }),
    ).toEqual({ unpaired: [], malformed: [second] })
  })

  it("never refunds a fee row carrying a refund-shaped key", () => {
    const row = tx({
      type: LedgerTransactionType.InactivityFee,
      externalId: `ifee_refund_${walletId}_2026-10`,
    })

    expect(unpairedDebits({ transactions: [row] })).toEqual({
      unpaired: [],
      malformed: [row],
    })
  })

  it("never refunds a fee row carrying another wallet's key", () => {
    const row = tx({
      type: LedgerTransactionType.InactivityFee,
      externalId: `ifee_${otherWalletId}_2026-10`,
    })

    expect(unpairedDebits({ transactions: [row] })).toEqual({
      unpaired: [],
      malformed: [row],
    })
  })

  it("never refunds a fee-typed row that is not a debit leg", () => {
    const creditLeg = {
      ...fee("2026-10"),
      debit: 0 as Satoshis,
      credit: 1289 as Satoshis,
    }

    expect(unpairedDebits({ transactions: [creditLeg] })).toEqual({
      unpaired: [],
      malformed: [creditLeg],
    })
  })

  it("ignores rows of other types", () => {
    const other = tx({ type: LedgerTransactionType.IntraLedger, externalId: undefined })

    expect(unpairedDebits({ transactions: [other] })).toEqual({
      unpaired: [],
      malformed: [],
    })
  })

  it("hands back a fee row whose key cannot be read instead of guessing", () => {
    const noKey = tx({ type: LedgerTransactionType.InactivityFee, externalId: undefined })
    const badKey = tx({ type: LedgerTransactionType.InactivityFee, externalId: "ifee_x" })
    const noWallet = tx({
      type: LedgerTransactionType.InactivityFee,
      externalId: `ifee_${walletId}_2026-10`,
      wallet: undefined,
    })

    expect(unpairedDebits({ transactions: [noKey, badKey, noWallet] })).toEqual({
      unpaired: [],
      malformed: [noKey, badKey, noWallet],
    })
  })
})

describe("history labels", () => {
  it("labels a Bitcoin Balance fee with dollars, sats and the rate", () => {
    expect(
      inactivityFeeMemo({
        currency: WalletCurrency.Btc,
        sats: 1289n,
        cents: 100n,
        rate: 77566.2,
      }),
    ).toBe("Inactivity fee — $1.00 (1,289 sats at $77,566/BTC)")
  })

  it("labels a Dollar Balance fee with dollars only", () => {
    expect(
      inactivityFeeMemo({
        currency: WalletCurrency.Usd,
        sats: 773n,
        cents: 60n,
        rate: 1,
      }),
    ).toBe("Inactivity fee — $0.60")
  })

  it("labels refunds in the balance's own unit", () => {
    expect(
      inactivityFeeRefundMemo({ currency: WalletCurrency.Btc, sats: 1289, cents: 100 }),
    ).toBe("Inactivity fee refund — 1,289 sats")
    expect(
      inactivityFeeRefundMemo({ currency: WalletCurrency.Usd, sats: 773, cents: 60 }),
    ).toBe("Inactivity fee refund — $0.60")
  })
})

describe("refund run ids", () => {
  const asOf = new Date("2026-09-21T10:00:00Z")
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

  it("names the kind, the UTC day and a fresh uuid", () => {
    expect(reactivationRunId({ asOf })).toMatch(
      new RegExp(`^reactivation-2026-09-21-${uuid}$`),
    )
    expect(claimsRunId({ asOf })).toMatch(new RegExp(`^claims-2026-09-21-${uuid}$`))
    expect(reactivationRunId({ asOf })).not.toBe(reactivationRunId({ asOf }))
  })
})
