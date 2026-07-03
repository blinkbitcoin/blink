const mockPersistAndReturnEntry = jest.fn()

jest.mock("@/services/ledger/helpers", () => ({
  ...jest.requireActual("@/services/ledger/helpers"),
  persistAndReturnEntry: (args: unknown) => mockPersistAndReturnEntry(args),
}))

jest.mock("@/services/ledger/facade/static-account-ids", () => ({
  staticAccountIds: async () => ({
    bankOwnerAccountId: "bank-owner-account",
    dealerBtcAccountId: "dealer-btc-account",
    dealerUsdAccountId: "dealer-usd-account",
  }),
}))

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

import { lndLedgerAccountId, toLedgerAccountDescriptor } from "@/services/ledger/domain"
import { recordLnFailedUsdSendRefund } from "@/services/ledger/facade/offchain-send"

describe("recordLnFailedUsdSendRefund", () => {
  const recipientWalletDescriptor = {
    id: "recipient-wallet" as WalletId,
    currency: WalletCurrency.Btc,
    accountId: "recipient-account" as AccountId,
  }
  const recipientAccountId = toLedgerAccountDescriptor(recipientWalletDescriptor).id

  const total = { amount: 10_000n, currency: WalletCurrency.Btc } as BtcPaymentAmount
  const usdTotal = { amount: 500n, currency: WalletCurrency.Usd } as UsdPaymentAmount

  const callRefund = (btcBankFee: BtcPaymentAmount) =>
    recordLnFailedUsdSendRefund({
      description: "refund",
      recipientWalletDescriptor,
      amountToCreditReceiver: { btc: total, usd: usdTotal },
      btcBankFee,
      metadata: {} as unknown as ReceiveLedgerMetadata,
      additionalCreditMetadata: {} as TxMetadata,
      additionalInternalMetadata: {} as TxMetadata,
    })

  const btc = (amount: bigint) =>
    ({ amount, currency: WalletCurrency.Btc }) as BtcPaymentAmount

  const legs = (): ILedgerTransaction[] =>
    mockPersistAndReturnEntry.mock.calls[0][0].entry.transactions

  const legFor = (account: string) => legs().find((t) => t.accounts === account)

  beforeEach(() => {
    mockPersistAndReturnEntry.mockReset()
  })

  it("credits the recipient the total, debits lnd the reserve and bank-owner the service fee", async () => {
    await callRefund(btc(3000n))

    const txs = legs()
    const totalCredit = txs.reduce((sum, t) => sum + t.credit, 0)
    const totalDebit = txs.reduce((sum, t) => sum + t.debit, 0)
    expect(totalCredit).toEqual(totalDebit)

    expect(legFor(recipientAccountId)).toEqual(
      expect.objectContaining({ credit: 10_000, currency: WalletCurrency.Btc }),
    )
    expect(legFor(lndLedgerAccountId)).toEqual(
      expect.objectContaining({ debit: 7000, currency: WalletCurrency.Btc }),
    )
    expect(legFor("bank-owner-account")).toEqual(
      expect.objectContaining({ debit: 3000, currency: WalletCurrency.Btc }),
    )
  })

  it("creates no dealer legs", async () => {
    await callRefund(btc(3000n))

    expect(legs()).toHaveLength(3)
    expect(legFor("dealer-btc-account")).toBeUndefined()
    expect(legFor("dealer-usd-account")).toBeUndefined()
  })

  it("degenerates to a 2-leg refund with no bank-owner clawback when bankFee is zero", async () => {
    await callRefund(btc(0n))

    expect(legs()).toHaveLength(2)
    expect(legFor(recipientAccountId)?.credit).toEqual(10_000)
    expect(legFor(lndLedgerAccountId)?.debit).toEqual(10_000)
    expect(legFor("bank-owner-account")).toBeUndefined()
  })

  it("returns an error and persists nothing when the service fee exceeds the total", async () => {
    const result = await callRefund(btc(10_001n))

    expect(result).toBeInstanceOf(InvalidLedgerTransactionStateError)
    expect(mockPersistAndReturnEntry).not.toHaveBeenCalled()
  })
})
