const mockRecordReceiveOffChain = jest.fn()
const mockLnFeeReimbursementReceiveLedgerMetadata = jest.fn()

jest.mock("@/services/ledger/facade", () => ({
  recordReceiveOffChain: (...args: unknown[]) => mockRecordReceiveOffChain(...args),
  LnFeeReimbursementReceiveLedgerMetadata: (...args: unknown[]) =>
    mockLnFeeReimbursementReceiveLedgerMetadata(...args),
}))

import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

import { PaymentFlowFromLedgerTransaction } from "@/app/payments/translations"
import { reimburseFee } from "@/app/payments/reimburse-fee"

// Finding B (Model 2): the unused routing reserve is refunded, but the 0.3%
// service fee folded into btcProtocolAndBankFee must be RETAINED. The flow is
// reconstructed from a settled ledger txn whose satsFee is the accounting TOTAL
// (routing reserve + service); the breakdown is recovered from the bank-owner
// credit leg and passed in as `bankFee` — so the reserve is recovered as
// total − service.
describe("reimburseFee (Model 2, finding B)", () => {
  const senderAccountId = "AccountId" as AccountId

  // total (satsFee) = routing reserve (5000) + service fee (3000)
  const satsFee = toSats(8000)
  const bankFee = toSats(3000)
  const satsAmount = toSats(1_000_000)
  const centsAmount = toCents(50_000)
  const centsFee = toCents(400)

  const ledgerTxn = {
    walletId: "walletId" as WalletId,
    currency: WalletCurrency.Btc,
    paymentHash: "paymentHash" as PaymentHash,
    type: LedgerTransactionType.Payment,
    satsAmount,
    centsAmount,
    satsFee,
    centsFee,
    timestamp: new Date(),
  } as LedgerTransaction<WalletCurrency>

  beforeEach(() => {
    mockRecordReceiveOffChain.mockReset()
    mockLnFeeReimbursementReceiveLedgerMetadata.mockReset()
    mockRecordReceiveOffChain.mockResolvedValue({ journalId: "journalId" })
    mockLnFeeReimbursementReceiveLedgerMetadata.mockReturnValue({
      metadata: {},
      creditAccountAdditionalMetadata: {},
      internalAccountsAdditionalMetadata: {},
    })
  })

  it("refunds reserve − actual (service fee retained), not total − actual", async () => {
    const paymentFlow = PaymentFlowFromLedgerTransaction({
      ledgerTxn,
      senderAccountId,
      bankFee,
    })
    if (paymentFlow instanceof Error) throw paymentFlow

    const actualFee = toSats(1000)
    const result = await reimburseFee({
      paymentFlow,
      senderDisplayAmount: 50_000 as DisplayCurrencyBaseAmount,
      senderDisplayCurrency: "USD" as DisplayCurrency,
      journalId: "journalId" as LedgerJournalId,
      actualFee,
    })
    expect(result).toBe(true)

    expect(mockRecordReceiveOffChain).toHaveBeenCalledTimes(1)
    const creditedBtc = (
      mockRecordReceiveOffChain.mock.calls[0][0] as {
        amountToCreditReceiver: { btc: { amount: bigint } }
      }
    ).amountToCreditReceiver.btc.amount

    // reserve − actual = 5000 − 1000 = 4000
    expect(creditedBtc).toEqual(4000n)
    // NOT total − actual = 8000 − 1000 = 7000 (that would refund the service fee)
    expect(creditedBtc).not.toEqual(7000n)
  })

  it("refunds the whole reserve when actual routing fee is zero, service still retained", async () => {
    const paymentFlow = PaymentFlowFromLedgerTransaction({
      ledgerTxn,
      senderAccountId,
      bankFee,
    })
    if (paymentFlow instanceof Error) throw paymentFlow

    const result = await reimburseFee({
      paymentFlow,
      senderDisplayAmount: 50_000 as DisplayCurrencyBaseAmount,
      senderDisplayCurrency: "USD" as DisplayCurrency,
      journalId: "journalId" as LedgerJournalId,
      actualFee: toSats(0),
    })
    expect(result).toBe(true)

    const creditedBtc = (
      mockRecordReceiveOffChain.mock.calls[0][0] as {
        amountToCreditReceiver: { btc: { amount: bigint } }
      }
    ).amountToCreditReceiver.btc.amount
    // reserve − 0 = 5000 (the service fee 3000 is never part of the refund)
    expect(creditedBtc).toEqual(5000n)
  })
})
