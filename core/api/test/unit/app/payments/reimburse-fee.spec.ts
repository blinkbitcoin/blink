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
    mockGetSkipFeeReimbursement.mockReset()
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
