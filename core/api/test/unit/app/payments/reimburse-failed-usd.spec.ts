import { reimburseFailedUsdPayment } from "@/app/payments/reimburse-failed-usd"
import { WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"
import * as LedgerFacade from "@/services/ledger/facade"
import { WalletsRepository } from "@/services/mongoose"
import {
  addAttributesToCurrentSpan,
  recordExceptionInCurrentSpan,
} from "@/services/tracing"

jest.mock("@/services/mongoose", () => ({ WalletsRepository: jest.fn() }))
jest.mock("@/services/tracing", () => ({
  ...jest.requireActual("@/services/tracing"),
  addAttributesToCurrentSpan: jest.fn(),
  recordExceptionInCurrentSpan: jest.fn(),
}))

describe("failed USD payment legacy precision", () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
  })

  it("composes the legacy constant with actual failed-payment refund metadata", async () => {
    const wallet = {
      id: "usd-wallet" as WalletId,
      accountId: "account" as AccountId,
      currency: WalletCurrency.Usd,
    }
    const btcWallet = {
      ...wallet,
      id: "btc-wallet" as WalletId,
      currency: WalletCurrency.Btc,
    }
    const paymentHash = "payment-hash" as PaymentHash
    const paymentAmounts = {
      btcPaymentAmount: { amount: 1000n, currency: WalletCurrency.Btc },
      usdPaymentAmount: { amount: 50n, currency: WalletCurrency.Usd },
      btcProtocolAndBankFee: ZERO_SATS,
      usdProtocolAndBankFee: ZERO_CENTS,
    }
    const totalAmounts = {
      btc: paymentAmounts.btcPaymentAmount,
      usd: paymentAmounts.usdPaymentAmount,
    }
    const paymentFlow = {
      ...paymentAmounts,
      btcBankFee: ZERO_SATS,
      senderWalletDescriptor: () => wallet,
      paymentHashForFlow: () => paymentHash,
      totalAmountsForPayment: () => totalAmounts,
    } as unknown as PaymentFlow<typeof WalletCurrency.Usd, typeof WalletCurrency.Btc>
    jest.mocked(WalletsRepository).mockReturnValue({
      findById: async () => wallet,
      listByAccountId: async () => [wallet, btcWallet],
    } as unknown as ReturnType<typeof WalletsRepository>)
    const refund = jest
      .spyOn(LedgerFacade, "recordLnFailedUsdSendRefund")
      .mockResolvedValue({} as LedgerJournal)

    const result = await reimburseFailedUsdPayment({
      walletId: wallet.id,
      paymentFlow,
      pendingPayment: {
        id: "transaction" as LedgerTransactionId,
        journalId: "journal" as LedgerJournalId,
        displayAmount: 2197 as DisplayCurrencyBaseAmount,
        displayFee: 20 as DisplayCurrencyBaseAmount,
        displayCurrency: "COP" as DisplayCurrency,
        displayCurrencyFractionDigits: undefined,
        timestamp: new Date("2026-07-03T00:00:00Z"),
      } as LedgerTransaction<typeof WalletCurrency.Usd>,
    })

    expect(result).toBe(true)
    expect(refund).toHaveBeenCalledTimes(1)
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientWalletDescriptor: btcWallet,
        amountToCreditReceiver: totalAmounts,
        additionalCreditMetadata: expect.objectContaining({
          displayAmount: 2197,
          displayFee: 20,
          displayCurrency: "COP",
          displayCurrencyFractionDigits: 2,
        }),
      }),
    )
    expect(addAttributesToCurrentSpan).toHaveBeenCalledWith({
      "payment.displayCurrencyFractionDigitsSource": "legacyConstantFallback",
      "payment.displayCurrencyFractionDigits": 2,
    })
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
  })
})
