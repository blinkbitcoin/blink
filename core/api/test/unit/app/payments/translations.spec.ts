import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { LedgerTransactionType } from "@/domain/ledger"
import {
  MissingPropsInTransactionForPaymentFlowError,
  NonLnPaymentTransactionForPaymentFlowError,
} from "@/domain/payments"
import { WalletCurrency } from "@/domain/shared"
import { PaymentInitiationMethod, SettlementMethod } from "@/domain/wallets"

import { PaymentFlowFromLedgerTransaction } from "@/app/payments/translations"

describe("PaymentFlowFromLedgerTransaction", () => {
  const satsAmount = toSats(20_000)
  const centsAmount = toCents(1_000)
  const satsFee = toSats(400)
  const centsFee = toCents(20)

  const timestamp = new Date()

  const senderAccountId = "AccountId" as AccountId

  const ledgerTxnBase = {
    walletId: "walletId" as WalletId,
    paymentHash: "paymentHash" as PaymentHash,
    satsAmount,
    centsAmount,
    satsFee,
    centsFee,
    timestamp,
    type: LedgerTransactionType.Payment,
  }

  const expectedPaymentFlowStateBase = {
    senderWalletId: "walletId" as WalletId,
    settlementMethod: SettlementMethod.Lightning,
    paymentInitiationMethod: PaymentInitiationMethod.Lightning,

    paymentHash: "paymentHash" as PaymentHash,
    descriptionFromInvoice: "",
    createdAt: timestamp,
    paymentSentAndPending: true,

    btcPaymentAmount: {
      amount: BigInt(satsAmount),
      currency: WalletCurrency.Btc,
    },
    usdPaymentAmount: {
      amount: BigInt(centsAmount),
      currency: WalletCurrency.Usd,
    },

    btcProtocolAndBankFee: {
      amount: BigInt(satsFee),
      currency: WalletCurrency.Btc,
    },
    usdProtocolAndBankFee: {
      amount: BigInt(centsFee),
      currency: WalletCurrency.Usd,
    },
  }

  it("builds correct PaymentFlow from btc transaction", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Btc,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).not.toBeInstanceOf(Error)

    const expectedPaymentFlowState = {
      ...expectedPaymentFlowStateBase,
      senderWalletCurrency: WalletCurrency.Btc,
      inputAmount: BigInt(satsAmount),
    }
    expect(paymentFlow).toEqual(expect.objectContaining(expectedPaymentFlowState))
  })

  it("builds correct PaymentFlow from usd transaction", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Usd,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).not.toBeInstanceOf(Error)

    const expectedPaymentFlowState = {
      ...expectedPaymentFlowStateBase,
      senderWalletCurrency: WalletCurrency.Usd,
      inputAmount: BigInt(centsAmount),
    }
    expect(paymentFlow).toEqual(expect.objectContaining(expectedPaymentFlowState))
  })

  it("reconstructs the service-fee breakdown from the bankFee param (Model 2, leg-recovery)", () => {
    const bankFee = toSats(40)
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Btc,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({
      ledgerTxn,
      senderAccountId,
      bankFee,
    })
    expect(paymentFlow).not.toBeInstanceOf(Error)
    if (paymentFlow instanceof Error) throw paymentFlow

    // btcProtocolAndBankFee = satsFee = accounting TOTAL (routing reserve + service)
    expect(paymentFlow.btcProtocolAndBankFee).toEqual({
      amount: BigInt(satsFee),
      currency: WalletCurrency.Btc,
    })
    // btcBankFee = service-fee breakdown recovered from the bank-owner leg (NOT zero)
    expect(paymentFlow.btcBankFee).toEqual({
      amount: BigInt(bankFee),
      currency: WalletCurrency.Btc,
    })
    // usd breakdown rebuilt via the price ratio (20000 sats / 1000 cents → 2 cents)
    expect(paymentFlow.usdBankFee.amount).toEqual(2n)
    // routing reserve recoverable as total − service
    expect(
      paymentFlow.btcProtocolAndBankFee.amount - paymentFlow.btcBankFee.amount,
    ).toEqual(BigInt(satsFee - bankFee))
  })

  it("defaults the service-fee breakdown to zero when bankFee is absent (legacy/zero-fee)", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Btc,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).not.toBeInstanceOf(Error)
    if (paymentFlow instanceof Error) throw paymentFlow

    expect(paymentFlow.btcBankFee).toEqual({
      amount: 0n,
      currency: WalletCurrency.Btc,
    })
    expect(paymentFlow.usdBankFee).toEqual({
      amount: 0n,
      currency: WalletCurrency.Usd,
    })
  })

  it("handles zero fee btc transaction", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Btc,
      satsFee: toSats(0),
      centsFee: toCents(0),
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).not.toBeInstanceOf(Error)

    const expectedPaymentFlowState = {
      ...expectedPaymentFlowStateBase,
      senderWalletCurrency: WalletCurrency.Btc,
      inputAmount: BigInt(satsAmount),
      btcProtocolAndBankFee: {
        amount: BigInt(0),
        currency: WalletCurrency.Btc,
      },
      usdProtocolAndBankFee: {
        amount: BigInt(0),
        currency: WalletCurrency.Usd,
      },
    }
    expect(paymentFlow).toEqual(expect.objectContaining(expectedPaymentFlowState))
  })

  it("handles zero fee usd transaction", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      currency: WalletCurrency.Usd,
      satsFee: toSats(0),
      centsFee: toCents(0),
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).not.toBeInstanceOf(Error)

    const expectedPaymentFlowState = {
      ...expectedPaymentFlowStateBase,
      senderWalletCurrency: WalletCurrency.Usd,
      inputAmount: BigInt(centsAmount),
      btcProtocolAndBankFee: {
        amount: BigInt(0),
        currency: WalletCurrency.Btc,
      },
      usdProtocolAndBankFee: {
        amount: BigInt(0),
        currency: WalletCurrency.Usd,
      },
    }
    expect(paymentFlow).toEqual(expect.objectContaining(expectedPaymentFlowState))
  })

  it("returns error for transaction with missing walletId", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      walletId: undefined,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).toBeInstanceOf(MissingPropsInTransactionForPaymentFlowError)
  })

  it("returns error for transaction with wrong type", () => {
    const ledgerTxn = {
      ...ledgerTxnBase,
      type: LedgerTransactionType.LnIntraLedger,
    } as LedgerTransaction<WalletCurrency>
    const paymentFlow = PaymentFlowFromLedgerTransaction({ ledgerTxn, senderAccountId })
    expect(paymentFlow).toBeInstanceOf(NonLnPaymentTransactionForPaymentFlowError)
  })
})
