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

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("retains the reserve (no sender credit) when the flag is enabled", async () => {
    mockGetLnFeeReserveRetentionEnabled.mockReturnValue(true)
    const recordReceiveOffChainSpy = jest.spyOn(LedgerFacadeImpl, "recordReceiveOffChain")

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
    })

    expect(result).toBe(true)
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
  })

  it("never credits the sender when there is no fee difference (flag is irrelevant)", async () => {
    mockGetLnFeeReserveRetentionEnabled.mockReturnValue(false)
    const recordReceiveOffChainSpy = jest.spyOn(LedgerFacadeImpl, "recordReceiveOffChain")

    const result = await reimburseFee({
      paymentFlow: buildPaymentFlow(),
      ...reimburseArgs,
      actualFee: 100 as Satoshis,
    })

    expect(result).toBe(true)
    expect(recordReceiveOffChainSpy).not.toHaveBeenCalled()
  })
})
