/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectEntryToEqual", "expectJournalToBeBalanced"] }] */

import { WalletCurrency } from "@/domain/shared"

import { lndLedgerAccountId } from "@/services/ledger/domain"
import { MainBook } from "@/services/ledger/books"
import { FeeRefundEntryBuilder } from "@/services/ledger/domain/fee-refund-entry-builder"

const createEntry = () => MainBook.entry("")

describe("FeeRefundEntryBuilder", () => {
  const findEntry = (txs: ILedgerTransaction[], account: string): ILedgerTransaction => {
    const entry = txs.find((tx) => tx.accounts === account)
    if (!entry) throw new Error("Invalid entry")
    return entry
  }

  const expectEntryToEqual = (
    entry: ILedgerTransaction,
    amount: Amount<WalletCurrency>,
  ) => {
    expect(entry.debit + entry.credit).toEqual(Number(amount.amount))
    expect(entry.currency).toEqual(amount.currency)
  }

  const expectJournalToBeBalanced = (journal: MediciEntry) => {
    let usdCredits = 0
    let btcCredits = 0
    let usdDebits = 0
    let btcDebits = 0

    const credits = journal.transactions.filter((t) => t.credit > 0)
    const debits = journal.transactions.filter((t) => t.debit > 0)
    const zeroAmounts = journal.transactions.filter(
      (t) => t.debit === 0 && t.credit === 0,
    )

    // eslint-disable-next-line
    Object.values<any>(debits).forEach((entry) =>
      entry.currency === WalletCurrency.Usd
        ? (usdDebits += entry.amount)
        : (btcDebits += entry.amount),
    )
    // eslint-disable-next-line
    Object.values<any>(credits).forEach((entry) =>
      entry.currency === WalletCurrency.Usd
        ? (usdCredits += entry.amount)
        : (btcCredits += entry.amount),
    )

    expect(usdCredits).toEqual(usdDebits)
    expect(btcCredits).toEqual(btcDebits)
    expect(zeroAmounts.length).toBe(0)
  }

  const staticAccountIds = {
    bankOwnerAccountId: "bankOwnerAccountId" as LedgerAccountId,
  }

  const recipientAccountDescriptor = {
    id: "recipientAccountId" as LedgerAccountId,
    currency: WalletCurrency.Btc,
  } as LedgerAccountDescriptor<"BTC">

  const metadata = {
    currency: "BAD CURRENCY",
    some: "some",
    more: "more",
  }

  const total = { amount: 10_000n, currency: WalletCurrency.Btc } as BtcPaymentAmount

  const btc = (amount: bigint) =>
    ({ amount, currency: WalletCurrency.Btc }) as BtcPaymentAmount

  const buildRefund = (btcBankFee: BtcPaymentAmount) =>
    FeeRefundEntryBuilder({
      entry: createEntry(),
      metadata,
      additionalCreditMetadata: {},
      additionalInternalMetadata: {},
      staticAccountIds,
      amountToRefund: total,
      btcBankFee,
    })
      .creditRecipient({ accountDescriptor: recipientAccountDescriptor })
      .debitOffChain()
      .debitBankOwner()

  it("credits the recipient the total, debits lnd the reserve and bank-owner the service fee", () => {
    const result = buildRefund(btc(3000n))

    const credits = result.transactions.filter((t) => t.credit > 0)
    const debits = result.transactions.filter((t) => t.debit > 0)

    expectJournalToBeBalanced(result)
    expect(result.transactions.length).toBe(3)

    expectEntryToEqual(findEntry(credits, recipientAccountDescriptor.id), total)
    expectEntryToEqual(findEntry(debits, lndLedgerAccountId), btc(7000n))
    expectEntryToEqual(findEntry(debits, staticAccountIds.bankOwnerAccountId), btc(3000n))
  })

  it("stamps every leg BTC and creates no dealer legs", () => {
    const result = buildRefund(btc(3000n))

    result.transactions.forEach((tx) => expect(tx.currency).toEqual(WalletCurrency.Btc))
  })

  it("degenerates to a 2-leg refund with no bank-owner clawback when the fee is zero", () => {
    const result = buildRefund(btc(0n))

    const credits = result.transactions.filter((t) => t.credit > 0)
    const debits = result.transactions.filter((t) => t.debit > 0)

    expectJournalToBeBalanced(result)
    expect(result.transactions.length).toBe(2)

    expectEntryToEqual(findEntry(credits, recipientAccountDescriptor.id), total)
    expectEntryToEqual(findEntry(debits, lndLedgerAccountId), total)
    expect(
      debits.find((tx) => tx.accounts === staticAccountIds.bankOwnerAccountId),
    ).toBeUndefined()
  })
})
