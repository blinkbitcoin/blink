import {
  TransactionsStreamSettlementVia,
  TransactionsStreamTransactionType,
  ledgerTransactionToTransactionStreamEvent,
  ledgerTransactionTypeToTransactionsStreamSettlementVia,
  transactionsStreamWalletAccountIdCacheKey,
} from "@/domain/transactions-stream"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

const ledgerTransaction = (
  args: { walletId?: WalletId } = {},
): LedgerTransaction<WalletCurrency> => {
  const walletId = Object.prototype.hasOwnProperty.call(args, "walletId")
    ? args.walletId
    : ("wallet-1" as WalletId)

  return {
    id: "661111111111111111111111" as LedgerTransactionId,
    walletId,
    paymentHash: "payment-hash-1" as PaymentHash,
    type: LedgerTransactionType.Payment,
    debit: 321 as Satoshis,
    credit: -321 as Satoshis,
    pendingConfirmation: false,
    currency: WalletCurrency.Btc,
    journalId: "journal-1" as LedgerJournalId,
    satsAmount: 321 as Satoshis,
    centsAmount: 654 as UsdCents,
    timestamp: new Date("2024-01-01T00:00:00Z"),
    feeKnownInAdvance: false,
    fee: undefined,
    usd: undefined,
    feeUsd: undefined,
  } as LedgerTransaction<WalletCurrency>
}

describe("ledgerTransactionTypeToTransactionsStreamSettlementVia", () => {
  it("maps ledger types to the expected settlement enum", () => {
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.Invoice,
      ),
    ).toBe(TransactionsStreamSettlementVia.Lightning)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.LnIntraLedger,
      ),
    ).toBe(TransactionsStreamSettlementVia.Intraledger)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(
        LedgerTransactionType.OnchainPayment,
      ),
    ).toBe(TransactionsStreamSettlementVia.Onchain)
    expect(
      ledgerTransactionTypeToTransactionsStreamSettlementVia(LedgerTransactionType.Fee),
    ).toBe(TransactionsStreamSettlementVia.Unspecified)
  })
})

describe("transactionsStreamWalletAccountIdCacheKey", () => {
  it("scopes wallet account id cache entries by wallet id", () => {
    expect(transactionsStreamWalletAccountIdCacheKey("wallet-1" as WalletId)).toBe(
      "transactions-stream:wallet-account-id:wallet-1",
    )
  })
})

describe("ledgerTransactionToTransactionStreamEvent", () => {
  it("maps ledger transactions into transaction stream events", () => {
    expect(
      ledgerTransactionToTransactionStreamEvent({
        ledgerTransaction: ledgerTransaction(),
        accountId: "account-1" as AccountId,
      }),
    ).toEqual({
      ledgerTransactionId: "661111111111111111111111",
      walletId: "wallet-1",
      accountId: "account-1",
      paymentHash: "payment-hash-1",
      satsAmount: 321,
      centsAmount: 654,
      currency: WalletCurrency.Btc,
      type: TransactionsStreamTransactionType.Sent,
      settlementVia: TransactionsStreamSettlementVia.Lightning,
      pending: false,
      timestamp: new Date("2024-01-01T00:00:00Z"),
    })
  })

  it("skips ledger transactions without a wallet id", () => {
    expect(
      ledgerTransactionToTransactionStreamEvent({
        ledgerTransaction: ledgerTransaction({ walletId: undefined }),
        accountId: undefined,
      }),
    ).toBeUndefined()
  })
})
