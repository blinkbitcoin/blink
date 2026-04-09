jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

jest.mock("@/services/api-keys", () => ({
  __mockApiKeys: {
    checkAndLockSpending: jest.fn(),
    recordSpending: jest.fn(),
    reverseSpending: jest.fn(),
  },
  ApiKeysService: () => ({
    checkAndLockSpending:
      jest.requireMock("@/services/api-keys").__mockApiKeys.checkAndLockSpending,
    recordSpending: jest.requireMock("@/services/api-keys").__mockApiKeys.recordSpending,
    reverseSpending:
      jest.requireMock("@/services/api-keys").__mockApiKeys.reverseSpending,
  }),
}))

jest.mock("@/app/accounts", () => ({
  checkIntraledgerLimits: jest.fn(),
  checkTradeIntraAccountLimits: jest.fn(),
  checkWithdrawalLimits: jest.fn(),
}))

import { withSpendingLimits } from "@/app/payments/spending-limits"
import { PaymentSendStatus } from "@/domain/bitcoin/lightning"
import { ApiKeyLimitExceededError } from "@/domain/api-keys/errors"
import { SettlementMethod } from "@/domain/wallets"
import { recordExceptionInCurrentSpan } from "@/services/tracing"
import {
  checkIntraledgerLimits,
  checkTradeIntraAccountLimits,
  checkWithdrawalLimits,
} from "@/app/accounts"

const mockApiKeys = jest.requireMock("@/services/api-keys").__mockApiKeys as {
  checkAndLockSpending: jest.Mock
  recordSpending: jest.Mock
  reverseSpending: jest.Mock
}

const mockRecordExceptionInCurrentSpan = recordExceptionInCurrentSpan as jest.Mock
const mockCheckIntraledgerLimits = checkIntraledgerLimits as jest.Mock
const mockCheckTradeIntraAccountLimits = checkTradeIntraAccountLimits as jest.Mock
const mockCheckWithdrawalLimits = checkWithdrawalLimits as jest.Mock

describe("withSpendingLimits", () => {
  const apiKeyId = "api-key-id" as ApiKeyId
  const btcPaymentAmount = { amount: 1000n, currency: "BTC" } as BtcPaymentAmount
  const journalId = "journal-id" as LedgerJournalId
  const walletId = "wallet-id" as WalletId

  const paymentSendSuccessResult: PaymentSendResult = {
    status: PaymentSendStatus.Success,
    transaction: { walletId } as WalletTransaction,
  }

  const paymentSendAlreadyPaidResult: PaymentSendResult = {
    status: PaymentSendStatus.AlreadyPaid,
    transaction: { walletId } as WalletTransaction,
  }

  const paymentSendFailureResult: PaymentSendResult = {
    status: PaymentSendStatus.Failure,
    transaction: { walletId } as WalletTransaction,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockApiKeys.checkAndLockSpending.mockResolvedValue("ephemeral-id" as EphemeralId)
    mockApiKeys.recordSpending.mockResolvedValue(true)
    mockApiKeys.reverseSpending.mockResolvedValue(true)
    mockCheckIntraledgerLimits.mockResolvedValue(true)
    mockCheckTradeIntraAccountLimits.mockResolvedValue(true)
    mockCheckWithdrawalLimits.mockResolvedValue(true)
  })

  it("returns account limit error without attempting api key lock", async () => {
    const accountLimitError = new ApiKeyLimitExceededError()
    mockCheckWithdrawalLimits.mockResolvedValue(accountLimitError)

    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toBe(accountLimitError)
    expect(mockApiKeys.checkAndLockSpending).not.toHaveBeenCalled()
  })

  it("records settlement when execution succeeds with settlement transaction id", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendSuccessResult)
    expect(mockApiKeys.checkAndLockSpending).toHaveBeenCalledWith({
      apiKeyId,
      amount: btcPaymentAmount,
    })
    expect(mockApiKeys.recordSpending).toHaveBeenCalled()
    expect(mockApiKeys.reverseSpending).not.toHaveBeenCalled()
  })

  it("reverses settlement when success result is already paid", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendAlreadyPaidResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendAlreadyPaidResult)
    expect(mockApiKeys.reverseSpending).toHaveBeenCalled()
    expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
  })

  it("reverses settlement when already-paid result has no settlement transaction id", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendAlreadyPaidResult,
      }),
    })

    expect(result).toEqual(paymentSendAlreadyPaidResult)
    expect(mockApiKeys.reverseSpending).toHaveBeenCalled()
    expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
  })

  it("reverses settlement when failure result has settlement transaction id", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendFailureResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendFailureResult)
    expect(mockApiKeys.reverseSpending).toHaveBeenCalled()
    expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
  })

  it("reverses settlement when execution fails without settlement transaction id", async () => {
    const executionError = new ApiKeyLimitExceededError()

    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: executionError,
      }),
    })

    expect(result).toBe(executionError)
    expect(mockApiKeys.reverseSpending).toHaveBeenCalled()
    expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
  })

  it("reverses settlement when execution fails with settlement transaction id", async () => {
    const executionError = new ApiKeyLimitExceededError()

    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: executionError,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toBe(executionError)
    expect(mockApiKeys.reverseSpending).toHaveBeenCalled()
    expect(mockApiKeys.recordSpending).not.toHaveBeenCalled()
  })

  it("records exception when settlement fails", async () => {
    const settlementError = new ApiKeyLimitExceededError()
    mockApiKeys.recordSpending.mockResolvedValue(settlementError)

    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.Lightning,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendSuccessResult)
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error: settlementError,
    })
  })

  it("checks trade intra-account limits for intraledger self transfer", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.IntraLedger,
      accountId: "same-account-id" as AccountId,
      recipientAccountId: "same-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendSuccessResult)
    expect(mockCheckTradeIntraAccountLimits).toHaveBeenCalledTimes(1)
    expect(mockCheckIntraledgerLimits).not.toHaveBeenCalled()
    expect(mockCheckWithdrawalLimits).not.toHaveBeenCalled()
  })

  it("checks intraledger limits for intraledger transfer to other account", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.IntraLedger,
      accountId: "sender-account-id" as AccountId,
      recipientAccountId: "recipient-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendSuccessResult)
    expect(mockCheckIntraledgerLimits).toHaveBeenCalledTimes(1)
    expect(mockCheckTradeIntraAccountLimits).not.toHaveBeenCalled()
  })

  it("checks withdrawal limits for non-intraledger settlement method", async () => {
    const result = await withSpendingLimits({
      settlementMethod: SettlementMethod.OnChain,
      accountId: "sender-account-id" as AccountId,
      usdPaymentAmount: { amount: 1000n, currency: "USD" } as UsdPaymentAmount,
      priceRatioForLimits: {} as WalletPriceRatio,
      apiKeyId,
      btcPaymentAmount,
      execute: async () => ({
        result: paymentSendSuccessResult,
        settlementTransactionId: journalId,
      }),
    })

    expect(result).toEqual(paymentSendSuccessResult)
    expect(mockCheckWithdrawalLimits).toHaveBeenCalledTimes(1)
  })
})
