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
})
