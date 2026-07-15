import { toSats } from "@/domain/bitcoin"
import { toCents } from "@/domain/fiat"
import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getSkipFeeReimbursement: jest.fn(),
}))

import { getSkipFeeReimbursement } from "@/config"

const mockGetSkipFeeReimbursement = getSkipFeeReimbursement as jest.MockedFunction<
  typeof getSkipFeeReimbursement
>

jest.mock("@/services/tracing", () => ({
  ...jest.requireActual("@/services/tracing"),
  recordExceptionInCurrentSpan: jest.fn(),
}))

import { recordExceptionInCurrentSpan } from "@/services/tracing"

const mockRecordExceptionInCurrentSpan = recordExceptionInCurrentSpan as jest.Mock

import { PaymentFlowFromLedgerTransaction } from "@/app/payments/translations"
import { reimburseFee } from "@/app/payments/reimburse-fee"

import * as LedgerFacadeImpl from "@/services/ledger/facade"

describe("reimburseFee", () => {
  const maxFee = {
    btc: { amount: 100n, currency: WalletCurrency.Btc },
    usd: { amount: 5n, currency: WalletCurrency.Usd },
  }
  const paymentAmounts = {
    btc: { amount: 1000n, currency: WalletCurrency.Btc },
    usd: { amount: 50n, currency: WalletCurrency.Usd },
  }
  const senderWalletDescriptor = {
    id: "walletId" as WalletId,
    currency: WalletCurrency.Btc,
    accountId: "accountId" as AccountId,
  }
  const paymentHash = "paymentHash" as PaymentHash

  const buildPaymentFlow = () =>
    ({
      btcPaymentAmount: paymentAmounts.btc,
      usdPaymentAmount: paymentAmounts.usd,
      btcProtocolAndBankFee: maxFee.btc,
      usdProtocolAndBankFee: maxFee.usd,
      // no service fee in these flows → reserve = protocolAndBankFee (finding B, #07)
      btcBankFee: { amount: 0n, currency: WalletCurrency.Btc },
      usdBankFee: { amount: 0n, currency: WalletCurrency.Usd },
      paymentAmounts: () => paymentAmounts,
      paymentHash,
      paymentHashForFlow: () => paymentHash,
      senderWalletDescriptor: () => senderWalletDescriptor,
    }) as unknown as PaymentFlow<WalletCurrency, WalletCurrency>

  const reimburseArgs = {
    senderDisplayAmount: 50 as DisplayCurrencyBaseAmount,
    senderDisplayCurrency: "USD" as DisplayCurrency,
    journalId: "journalId" as LedgerJournalId,
    actualFee: 20 as Satoshis,
  }

  beforeEach(() => {
    mockGetSkipFeeReimbursement.mockReset()
    mockRecordExceptionInCurrentSpan.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("retains the reserve when the flag is enabled", async () => {
    mockGetSkipFeeReimbursement.mockReturnValue(true)
    const recordReceiveOffChainSpy = jest.spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
    const recordLnFeeReserveRetainedSpy = jest
      .spyOn(LedgerFacadeImpl, "recordLnFeeReserveRetained")
      .mockResolvedValue(
        true as unknown as Awaited<
          ReturnType<typeof LedgerFacadeImpl.recordLnFeeReserveRetained>
        >,
      )

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
    })

    expect(result).toBe(true)
    expect(recordLnFeeReserveRetainedSpy).toHaveBeenCalledTimes(1)

    const callArgs = recordLnFeeReserveRetainedSpy.mock.calls[0][0]
    expect(callArgs.paymentAmount.amount).toBe(80n)
    expect(callArgs.metadata.type).toBe(LedgerTransactionType.LnReserveRetained)
    expect(callArgs.metadata.hash).toBe(paymentHash)

    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })

  it("does not fail the payment when the recognition journal errors (fail-open)", async () => {
    mockGetSkipFeeReimbursement.mockReturnValue(true)
    const recordReceiveOffChainSpy = jest.spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
    const ledgerError = new Error("ledger commit failed")
    jest
      .spyOn(LedgerFacadeImpl, "recordLnFeeReserveRetained")
      .mockResolvedValue(
        ledgerError as unknown as Awaited<
          ReturnType<typeof LedgerFacadeImpl.recordLnFeeReserveRetained>
        >,
      )

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
    })

    expect(result).toBe(true)
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
    expect(mockRecordExceptionInCurrentSpan.mock.calls[0][0].error).toBe(ledgerError)
    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })

  it("reimburses the sender when the flag is disabled", async () => {
    mockGetSkipFeeReimbursement.mockReturnValue(false)
    const recordReceiveOffChainSpy = jest
      .spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
      .mockResolvedValue(
        true as unknown as Awaited<
          ReturnType<typeof LedgerFacadeImpl.recordReceiveOffChain>
        >,
      )

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
    })

    expect(result).toBe(true)
    expect(recordReceiveOffChainSpy).toHaveBeenCalledTimes(1)
    expect(recordReceiveOffChainSpy.mock.calls[0][0].description).toBe(
      "fee reimbursement",
    )
    // Reimburses exactly the fee difference (100 - 20 = 80) to the sender
    expect(
      recordReceiveOffChainSpy.mock.calls[0][0].amountToCreditReceiver.btc.amount,
    ).toBe(80n)
    expect(recordReceiveOffChainSpy.mock.calls[0][0].recipientWalletDescriptor.id).toBe(
      "walletId",
    )
  })

  it("returns true without crediting when the fee difference is zero (short-circuits the retention flag)", async () => {
    mockGetSkipFeeReimbursement.mockReturnValue(true)
    const recordReceiveOffChainSpy = jest.spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
    const recordLnFeeReserveRetainedSpy = jest.spyOn(
      LedgerFacadeImpl,
      "recordLnFeeReserveRetained",
    )

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
      actualFee: 100 as Satoshis,
    })

    expect(result).toBe(true)
    expect(mockGetSkipFeeReimbursement).not.toHaveBeenCalled()
    expect(recordLnFeeReserveRetainedSpy).not.toHaveBeenCalled()
    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })
})

// Finding B (Model 2, #07): the unused routing reserve is refunded, but the 0.3%
// service fee folded into btcProtocolAndBankFee must be RETAINED. The flow is
// reconstructed from a settled ledger txn whose satsFee is the accounting TOTAL
// (routing reserve + service); the breakdown is recovered from the bank-owner
// credit leg and passed in as `bankFee` — so the reserve is recovered as
// total − service. (Retention flag OFF here, so it hits the reimburse path.)
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
    mockGetSkipFeeReimbursement.mockReset()
    mockGetSkipFeeReimbursement.mockReturnValue(false)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("refunds reserve − actual (service fee retained), not total − actual", async () => {
    const recordReceiveOffChainSpy = jest
      .spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
      .mockResolvedValue(
        true as unknown as Awaited<
          ReturnType<typeof LedgerFacadeImpl.recordReceiveOffChain>
        >,
      )

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
      actualFee: toSats(1000),
    })
    expect(result).toBe(true)
    expect(recordReceiveOffChainSpy).toHaveBeenCalledTimes(1)

    const creditedBtc =
      recordReceiveOffChainSpy.mock.calls[0][0].amountToCreditReceiver.btc.amount
    // reserve − actual = 5000 − 1000 = 4000
    expect(creditedBtc).toEqual(4000n)
    // NOT total − actual = 8000 − 1000 = 7000 (that would refund the service fee)
    expect(creditedBtc).not.toEqual(7000n)
  })

  it("refunds the whole reserve when actual routing fee is zero, service still retained", async () => {
    const recordReceiveOffChainSpy = jest
      .spyOn(LedgerFacadeImpl, "recordReceiveOffChain")
      .mockResolvedValue(
        true as unknown as Awaited<
          ReturnType<typeof LedgerFacadeImpl.recordReceiveOffChain>
        >,
      )

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

    // reserve − 0 = 5000 (the service fee 3000 is never part of the refund)
    expect(
      recordReceiveOffChainSpy.mock.calls[0][0].amountToCreditReceiver.btc.amount,
    ).toEqual(5000n)
  })
})
