import mongoose from "mongoose"

import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"
import { translateToLedgerTx } from "@/services/ledger/translate"

describe("translateToLedgerTx", () => {
  it("normalizes a null persisted fraction digit value", () => {
    const raw = {
      _id: new mongoose.Types.ObjectId(),
      _journal: new mongoose.Types.ObjectId(),
      accounts: "Liabilities:wallet-id",
      type: LedgerTransactionType.OnchainReceipt,
      debit: 0,
      credit: 1_000,
      currency: WalletCurrency.Btc,
      timestamp: new Date(),
      pending: false,
      displayAmount: null,
      displayFee: null,
      displayCurrency: null,
      displayCurrencyFractionDigits: null,
    } as unknown as ILedgerTransaction

    expect(translateToLedgerTx(raw)).toEqual(
      expect.objectContaining({
        displayAmount: undefined,
        displayFee: undefined,
        displayCurrency: undefined,
        displayCurrencyFractionDigits: undefined,
      }),
    )
  })

  it("preserves output index zero", () => {
    const raw = {
      _id: new mongoose.Types.ObjectId(),
      _journal: new mongoose.Types.ObjectId(),
      accounts: "Liabilities:wallet-id",
      type: LedgerTransactionType.OnchainReceipt,
      debit: 0,
      credit: 1_000,
      currency: WalletCurrency.Btc,
      timestamp: new Date(),
      pending: false,
      hash: "ab".repeat(32),
      vout: 0,
      satsAmount: 1_000,
      centsAmount: 0,
      satsFee: 0,
      centsFee: 0,
      displayAmount: 0,
      displayFee: 0,
      displayCurrency: "USD",
    } as ILedgerTransaction

    expect(translateToLedgerTx(raw).vout).toBe(0)
  })

  describe("inactivity-fee provenance", () => {
    const provenance = {
      rate: 77566,
      rateSource: "price-service",
      configVersion: "v1",
      noticeId: "notice-1",
      refundReason: "activity",
      runId: "fee-2026-10-15-x",
    }

    const rawRow = (extra: Record<string, unknown>) =>
      ({
        _id: new mongoose.Types.ObjectId(),
        _journal: new mongoose.Types.ObjectId(),
        accounts: "Liabilities:wallet-id",
        external_id: "ifee_wallet-id_2026-10",
        type: LedgerTransactionType.InactivityFee,
        debit: 1_289,
        credit: 0,
        currency: WalletCurrency.Btc,
        timestamp: new Date(),
        pending: false,
        ...extra,
      }) as unknown as ILedgerTransaction

    it("reads the provenance back from meta", () => {
      expect(translateToLedgerTx(rawRow({ meta: provenance }))).toEqual(
        expect.objectContaining(provenance),
      )
    })

    it("leaves the provenance undefined on a row without meta", () => {
      const tx = translateToLedgerTx(rawRow({ type: LedgerTransactionType.Payment }))

      for (const key of Object.keys(provenance)) {
        expect(tx).toHaveProperty(key, undefined)
      }
    })

    it("ignores top-level provenance keys", () => {
      const tx = translateToLedgerTx(rawRow(provenance))

      for (const key of Object.keys(provenance)) {
        expect(tx).toHaveProperty(key, undefined)
      }
    })

    it("drops wrong-typed meta values without throwing", () => {
      const tx = translateToLedgerTx(
        rawRow({
          meta: {
            rate: "x",
            rateSource: 1,
            configVersion: null,
            noticeId: "",
            refundReason: {},
            runId: ["fee"],
          },
        }),
      )

      for (const key of Object.keys(provenance)) {
        expect(tx).toHaveProperty(key, undefined)
      }
    })

    it.each([NaN, Infinity])("drops a non-finite rate (%s)", (rate) => {
      expect(translateToLedgerTx(rawRow({ meta: { rate } })).rate).toBeUndefined()
    })
  })
})
