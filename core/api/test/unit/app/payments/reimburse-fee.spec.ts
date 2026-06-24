import { WalletCurrency } from "@/domain/shared"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getLnFeeReserveRetentionEnabled: jest.fn(),
}))

import { getLnFeeReserveRetentionEnabled } from "@/config"

const mockGetLnFeeReserveRetentionEnabled =
  getLnFeeReserveRetentionEnabled as jest.MockedFunction<
    typeof getLnFeeReserveRetentionEnabled
  >

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
    mockGetLnFeeReserveRetentionEnabled.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("retains the reserve (no sender credit) when the flag is enabled", async () => {
    mockGetLnFeeReserveRetentionEnabled.mockReturnValue(true)
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

    // Delegation-only (app-layer) check: reimburseFee delegates to the recognition
    // journal LedgerFacade.recordLnFeeReserveRetained with exactly the fee difference
    // (100 - 20 = 80) and the payment hash for attribution. The journal's ledger
    // directions (credit bank-owner / debit Assets:Reserve:Lightning) and type
    // (LnReserveRetained) live in services/ledger/facade/revenue.ts and are NOT
    // exercised here because the function is mocked below; that journal is built via
    // the shared EntryBuilder (mirroring reconciliation.ts) and balances by construction.
    expect(recordLnFeeReserveRetainedSpy).toHaveBeenCalledTimes(1)
    expect(recordLnFeeReserveRetainedSpy.mock.calls[0][0].paymentAmount.amount).toBe(80n)
    expect(recordLnFeeReserveRetainedSpy.mock.calls[0][0].paymentHash).toBe(paymentHash)

    // The sender is never credited in the retention branch.
    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })

  it("reimburses the sender when the flag is disabled (default behavior)", async () => {
    mockGetLnFeeReserveRetentionEnabled.mockReturnValue(false)
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
    // Reimburses exactly the fee difference (100 - 20 = 80) to the sender wallet.
    expect(recordReceiveOffChainSpy.mock.calls[0][0].amountToCreditReceiver.btc.amount).toBe(
      80n,
    )
    expect(recordReceiveOffChainSpy.mock.calls[0][0].recipientWalletDescriptor.id).toBe(
      "walletId",
    )
  })

  it("returns true without crediting when the fee difference is zero (zero-difference short-circuits the retention flag)", async () => {
    // Flag is ON, but actualFee === maxFee so feeDifference.btc.amount === 0n and the
    // function returns at the `=== 0n` early-return *before* the retention flag is read.
    mockGetLnFeeReserveRetentionEnabled.mockReturnValue(true)
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
    // The `=== 0n` early-return precedes the flag read, so the retention flag is
    // never consulted: proves the zero-difference branch wins over (short-circuits)
    // the retention flag rather than merely inferring it from the un-fired facades.
    expect(mockGetLnFeeReserveRetentionEnabled).not.toHaveBeenCalled()
    expect(recordLnFeeReserveRetainedSpy).not.toHaveBeenCalled()
    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })
})
