import { updatePendingPaymentByHash } from "@/app/payments/update-pending-payments"

import { getSkipFeeReimbursement } from "@/config"
import { PaymentStatus } from "@/domain/bitcoin/lightning"
import {
  LedgerTransactionType,
  MissingExpectedDisplayAmountsForTransactionError,
} from "@/domain/ledger"
import { ErrorLevel, WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"

import { LedgerService } from "@/services/ledger"
import * as LedgerFacade from "@/services/ledger/facade"
import { LndService } from "@/services/lnd"
import { baseLogger } from "@/services/logger"
import {
  AccountsRepository,
  LnPaymentsRepository,
  PaymentFlowStateRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

jest.mock("@/config", () => ({
  ...jest.requireActual("@/config"),
  getSkipFeeReimbursement: jest.fn(),
}))
jest.mock("@/app/migration-flow/settle-migration-flow", () => ({
  completeMigrationFlowForSettledPayment: jest.fn(),
}))
jest.mock("@/app/wallets", () => ({
  getTransactionForWalletByJournalId: jest.fn().mockResolvedValue({}),
}))
jest.mock("@/services/api-keys", () => ({ ApiKeysService: jest.fn() }))
jest.mock("@/services/ledger", () => ({ LedgerService: jest.fn() }))
jest.mock("@/services/lnd", () => ({ LndService: jest.fn() }))
jest.mock("@/services/lock", () => ({
  LockService: () => ({
    lockWalletId: (_walletId: WalletId, callback: () => unknown) => callback(),
  }),
}))
jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  LnPaymentsRepository: jest.fn(),
  PaymentFlowStateRepository: jest.fn(),
  UsersRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))
jest.mock("@/services/notifications", () => ({
  NotificationsService: () => ({ sendTransaction: jest.fn() }),
}))
jest.mock("@/services/tracing", () => ({
  ...jest.requireActual("@/services/tracing"),
  recordExceptionInCurrentSpan: jest.fn(),
}))

describe("pending payment display validation", () => {
  const paymentHash = "paymentHash" as PaymentHash
  const walletId = "walletId" as WalletId
  const wallet = {
    id: walletId,
    accountId: "accountId" as AccountId,
    currency: WalletCurrency.Btc,
  }
  const paymentAmounts = {
    btc: { amount: 60n, currency: WalletCurrency.Btc },
    usd: { amount: 20n, currency: WalletCurrency.Usd },
  }
  let pendingPayment: LedgerTransaction<WalletCurrency>
  let pending: boolean

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(getSkipFeeReimbursement).mockReturnValue(false)
    pending = true
    pendingPayment = {
      walletId,
      paymentHash,
      pubkey: "02".padEnd(66, "0") as Pubkey,
      journalId: "journalId" as LedgerJournalId,
      type: LedgerTransactionType.Payment,
      currency: WalletCurrency.Btc,
      debit: 90,
      satsFee: 30,
      centsFee: 10,
      satsAmount: 60,
      centsAmount: 20,
      displayAmount: 24,
      displayFee: 12,
      displayCurrency: "EUR",
      displayCurrencyFractionDigits: 2,
      timestamp: new Date("2026-07-20T00:00:00Z"),
      feeKnownInAdvance: false,
    } as LedgerTransaction<WalletCurrency>

    // Replace infrastructure boundaries, but exercise the real pending-payment
    // orchestration, display validation, and fee reimbursement calculation.
    jest.mocked(LedgerService).mockReturnValue({
      getWalletIdByPaymentHash: async () => walletId,
      getPendingPaymentsCount: async () => (pending ? 1 : 0),
      listPendingPayments: async () => [pendingPayment],
      isLnTxRecorded: async () => !pending,
    } as unknown as ReturnType<typeof LedgerService>)
    jest.mocked(LndService).mockReturnValue({
      lookupPayment: async () => ({
        status: PaymentStatus.Settled,
        roundedUpAmount: 80,
        confirmedDetails: { roundedUpFee: 20 },
      }),
    } as unknown as ReturnType<typeof LndService>)
    jest.mocked(LnPaymentsRepository).mockReturnValue({
      findByPaymentHash: async () => ({}),
    } as unknown as ReturnType<typeof LnPaymentsRepository>)
    jest.mocked(WalletsRepository).mockReturnValue({
      findById: async () => wallet,
      findAccountWalletsByAccountId: async () => ({
        BTC: wallet,
        USD: { id: "usdWalletId" },
      }),
    } as unknown as ReturnType<typeof WalletsRepository>)
    jest.mocked(AccountsRepository).mockReturnValue({
      findById: async () => ({ id: wallet.accountId, kratosUserId: "userId" }),
    } as unknown as ReturnType<typeof AccountsRepository>)
    jest.mocked(UsersRepository).mockReturnValue({
      findById: async () => ({ id: "userId" }),
    } as unknown as ReturnType<typeof UsersRepository>)
    jest.mocked(PaymentFlowStateRepository).mockReturnValue({
      markLightningPaymentFlowNotPending: async () => ({
        senderWalletCurrency: WalletCurrency.Btc,
        btcPaymentAmount: paymentAmounts.btc,
        usdPaymentAmount: paymentAmounts.usd,
        btcProtocolAndBankFee: { amount: 30n, currency: WalletCurrency.Btc },
        usdProtocolAndBankFee: { amount: 10n, currency: WalletCurrency.Usd },
        btcBankFee: ZERO_SATS,
        usdBankFee: ZERO_CENTS,
        paymentAmounts: () => paymentAmounts,
        paymentHashForFlow: () => paymentHash,
        senderWalletDescriptor: () => wallet,
      }),
    } as unknown as ReturnType<typeof PaymentFlowStateRepository>)
    jest.spyOn(LedgerFacade, "settlePendingLnSend").mockImplementation(async () => {
      pending = false
      return true
    })
    jest.spyOn(LedgerFacade, "updateLnPaymentState").mockResolvedValue(true)
    jest
      .spyOn(LedgerFacade, "recordReceiveOffChain")
      .mockResolvedValue({} as LedgerJournal)
    jest
      .spyOn(LedgerFacade, "recordLnFeeReserveRetained")
      .mockResolvedValue({} as LedgerJournal)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe.each([false, true])("skipFeeReimbursement: %s", (skipFeeReimbursement) => {
    beforeEach(() => {
      jest.mocked(getSkipFeeReimbursement).mockReturnValue(skipFeeReimbursement)
    })

    it.each([
      ["negative amount", { displayAmount: -24 }],
      ["zero amount", { displayAmount: 0 }],
      ["missing amount", { displayAmount: undefined }],
      ["missing currency", { displayCurrency: undefined }],
    ] as const)("settles a row with %s without reimbursing", async (_name, display) => {
      pendingPayment = {
        ...pendingPayment,
        ...display,
      } as LedgerTransaction<WalletCurrency>

      const result = await updatePendingPaymentByHash({ paymentHash, logger: baseLogger })

      expect(result).toBeUndefined()
      expect(LedgerFacade.settlePendingLnSend).toHaveBeenCalledWith(paymentHash)
      expect(pending).toBe(false)
      expect(LedgerFacade.recordReceiveOffChain).not.toHaveBeenCalled()
      expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
      expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith({
        error: expect.any(MissingExpectedDisplayAmountsForTransactionError),
        level: ErrorLevel.Warn,
      })
      expect(LedgerFacade.updateLnPaymentState).toHaveBeenCalledTimes(1)
      const retainedCall = [
        {
          paymentAmount: { amount: 10n, currency: WalletCurrency.Btc },
          metadata: expect.objectContaining({
            hash: paymentHash,
            type: LedgerTransactionType.LnReserveRetained,
          }),
        },
      ]
      expect(jest.mocked(LedgerFacade.recordLnFeeReserveRetained).mock.calls).toEqual(
        skipFeeReimbursement ? [retainedCall] : [],
      )
      expect(
        jest.mocked(LedgerFacade.settlePendingLnSend).mock.invocationCallOrder[0],
      ).toBeLessThan(
        jest.mocked(recordExceptionInCurrentSpan).mock.invocationCallOrder[0],
      )

      const second = await updatePendingPaymentByHash({ paymentHash, logger: baseLogger })
      expect(second).toBeUndefined()
      expect(LedgerFacade.settlePendingLnSend).toHaveBeenCalledTimes(1)
      expect(LedgerFacade.recordReceiveOffChain).not.toHaveBeenCalled()
      expect(LedgerFacade.recordLnFeeReserveRetained).toHaveBeenCalledTimes(
        skipFeeReimbursement ? 1 : 0,
      )
      expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
    })
  })

  it("reimburses with a missing display fee and records its warning in isolation", async () => {
    pendingPayment = { ...pendingPayment, displayFee: undefined }

    const result = await updatePendingPaymentByHash({ paymentHash, logger: baseLogger })

    expect(result).toBeUndefined()
    expect(pending).toBe(false)
    expect(LedgerFacade.recordReceiveOffChain).toHaveBeenCalledTimes(1)
    expect(LedgerFacade.recordReceiveOffChain).toHaveBeenCalledWith(
      expect.objectContaining({
        amountToCreditReceiver: expect.objectContaining({
          btc: { amount: 10n, currency: WalletCurrency.Btc },
        }),
        additionalCreditMetadata: expect.objectContaining({
          displayCurrency: "EUR",
          displayCurrencyFractionDigits: 2,
        }),
      }),
    )
    expect(LedgerFacade.recordLnFeeReserveRetained).not.toHaveBeenCalled()
    expect(LedgerFacade.updateLnPaymentState).toHaveBeenCalledTimes(1)
    // Valid persisted precision excludes fallback diagnostics, so the only
    // warning can be the missing display fee rather than another guard.
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledTimes(1)
    expect(recordExceptionInCurrentSpan).toHaveBeenCalledWith({
      error: expect.any(MissingExpectedDisplayAmountsForTransactionError),
      level: ErrorLevel.Warn,
    })
    expect(
      jest.mocked(recordExceptionInCurrentSpan).mock.calls[0][0].error,
    ).toMatchObject({
      message: "displayFee missing from pending payment",
    })
  })

  it("reimburses with a zero display fee without warning", async () => {
    pendingPayment = { ...pendingPayment, displayFee: 0 as DisplayCurrencyBaseAmount }

    const result = await updatePendingPaymentByHash({ paymentHash, logger: baseLogger })

    expect(result).toBeUndefined()
    expect(pending).toBe(false)
    expect(LedgerFacade.recordReceiveOffChain).toHaveBeenCalledTimes(1)
    expect(LedgerFacade.recordLnFeeReserveRetained).not.toHaveBeenCalled()
    expect(recordExceptionInCurrentSpan).not.toHaveBeenCalled()
  })
})
