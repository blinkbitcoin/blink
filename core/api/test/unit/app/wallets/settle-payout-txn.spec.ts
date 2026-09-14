import { settlePayout } from "@/app/wallets/settle-payout-txn"
import { getTransactionForWalletByJournalId } from "@/app/wallets/get-transaction-by-journal-id"

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { LedgerTransactionType } from "@/domain/ledger"
import { BigIntFloatConversionError, WalletCurrency } from "@/domain/shared"

import { settlePendingOnChainPayment } from "@/services/ledger/facade"
import {
  AccountsRepository,
  UsersRepository,
  WalletsRepository,
} from "@/services/mongoose"
import { NotificationsService } from "@/services/notifications"

jest.mock("@/app/wallets/get-transaction-by-journal-id", () => ({
  getTransactionForWalletByJournalId: jest.fn(),
}))
jest.mock("@/services/ledger/facade", () => ({
  settlePendingOnChainPayment: jest.fn(),
}))
jest.mock("@/services/mongoose", () => ({
  AccountsRepository: jest.fn(),
  UsersRepository: jest.fn(),
  WalletsRepository: jest.fn(),
}))
jest.mock("@/services/notifications", () => ({ NotificationsService: jest.fn() }))

describe.each([WalletCurrency.Btc, WalletCurrency.Usd])(
  "settlePayout (%s)",
  (currency) => {
    const payoutId = "payoutId" as PayoutId
    const wallet: Pick<Wallet, "id" | "accountId" | "currency"> = {
      id: "walletId" as WalletId,
      accountId: "accountId" as AccountId,
      currency,
    }
    const account: Pick<Account, "id" | "kratosUserId" | "level" | "status"> = {
      id: wallet.accountId,
      kratosUserId: "userId" as UserId,
      level: 1,
      status: "active",
    }
    const user: Pick<User, "id" | "phone"> = {
      id: account.kratosUserId,
      phone: "+16505550100" as PhoneNumber,
    }
    const journalId = "journalId" as LedgerJournalId
    const walletTransaction = {
      id: journalId,
      settlementDisplayCurrency: "EUR" as DisplayCurrency,
    } as unknown as WalletTransaction
    const sendTransaction = jest.fn<
      ReturnType<INotificationsService["sendTransaction"]>,
      Parameters<INotificationsService["sendTransaction"]>
    >()
    let ledgerTxn: LedgerTransaction<WalletCurrency>

    beforeEach(() => {
      jest.resetAllMocks()
      ledgerTxn = {
        id: "ledgerTransactionId" as LedgerTransactionId,
        walletId: wallet.id,
        type: LedgerTransactionType.OnchainPayment,
        currency,
        debit: 1000 as Satoshis,
        credit: 0 as Satoshis,
        timestamp: new Date("2026-07-20T00:00:00Z"),
        pendingConfirmation: false,
        journalId,
        feeKnownInAdvance: true,
        txHash: "a".repeat(64) as OnChainTxHash,
        satsAmount: 1000 as Satoshis,
        centsAmount: 100 as UsdCents,
        displayAmount: 10 as DisplayCurrencyBaseAmount,
        displayFee: 1 as DisplayCurrencyBaseAmount,
        displayCurrency: "EUR" as DisplayCurrency,
        fee: undefined,
        usd: undefined,
        feeUsd: undefined,
      }
      // Replace infrastructure only. Keep payout guards and payment conversion real.
      jest.mocked(settlePendingOnChainPayment).mockImplementation(async () => ledgerTxn)
      jest.mocked(WalletsRepository).mockReturnValue({
        findById: jest.fn().mockResolvedValue(wallet),
      } as unknown as ReturnType<typeof WalletsRepository>)
      jest.mocked(AccountsRepository).mockReturnValue({
        findById: jest.fn().mockResolvedValue(account),
      } as unknown as ReturnType<typeof AccountsRepository>)
      jest.mocked(UsersRepository).mockReturnValue({
        findById: jest.fn().mockResolvedValue(user),
      } as unknown as ReturnType<typeof UsersRepository>)
      // All downstream dependencies succeed, so they cannot mask a missing guard.
      jest.mocked(getTransactionForWalletByJournalId).mockResolvedValue(walletTransaction)
      sendTransaction.mockResolvedValue(true)
      jest.mocked(NotificationsService).mockReturnValue({
        sendTransaction,
      } as unknown as ReturnType<typeof NotificationsService>)
    })

    const expectNotification = () => {
      expect(settlePendingOnChainPayment).toHaveBeenCalledWith(payoutId)
      expect(getTransactionForWalletByJournalId).toHaveBeenCalledTimes(1)
      expect(getTransactionForWalletByJournalId).toHaveBeenCalledWith({
        walletId: wallet.id,
        journalId,
      })
      expect(sendTransaction).toHaveBeenCalledTimes(1)
      expect(sendTransaction).toHaveBeenCalledWith({
        recipient: {
          accountId: wallet.accountId,
          walletId: wallet.id,
          userId: user.id,
          level: account.level,
          status: account.status,
          phoneNumber: user.phone,
        },
        transaction: walletTransaction,
      })
    }

    const expectNoNotification = () => {
      expect(getTransactionForWalletByJournalId).not.toHaveBeenCalled()
      expect(sendTransaction).not.toHaveBeenCalled()
    }

    it("refuses a payout whose ledger row has no display currency", async () => {
      ledgerTxn = { ...ledgerTxn, displayCurrency: undefined }

      expect(await settlePayout(payoutId)).toBeInstanceOf(
        InvalidLedgerTransactionStateError,
      )
      expectNoNotification()
    })

    it("notifies for the same payout when its ledger row has a display currency", async () => {
      expect(await settlePayout(payoutId)).toBe(true)
      expectNotification()
    })

    it("passes a legacy payout without display amounts to notification transaction translation", async () => {
      ledgerTxn = { ...ledgerTxn, displayAmount: undefined, displayFee: undefined }

      expect(await settlePayout(payoutId)).toBe(true)
      expectNotification()
    })

    it("leaves unusable display amounts to notification transaction translation", async () => {
      // The removed conversion rejected Infinity even though its result was unused.
      ledgerTxn = { ...ledgerTxn, displayAmount: Infinity as DisplayCurrencyBaseAmount }

      expect(await settlePayout(payoutId)).toBe(true)
      expectNotification()
    })

    it("still refuses a legacy payout without a transaction hash", async () => {
      ledgerTxn = {
        ...ledgerTxn,
        displayAmount: undefined,
        displayFee: undefined,
        txHash: undefined,
      }

      expect(await settlePayout(payoutId)).toBeInstanceOf(
        InvalidLedgerTransactionStateError,
      )
      expectNoNotification()
    })

    it("still refuses a legacy payout without its wallet-currency payment amount", async () => {
      ledgerTxn = {
        ...ledgerTxn,
        displayAmount: undefined,
        displayFee: undefined,
        ...(currency === WalletCurrency.Btc
          ? { satsAmount: undefined }
          : { centsAmount: undefined }),
      }

      expect(await settlePayout(payoutId)).toBeInstanceOf(
        InvalidLedgerTransactionStateError,
      )
      expectNoNotification()
    })

    it.each([NaN, Infinity, -Infinity, 1.5])(
      "still refuses a legacy payout with invalid monetary payment amount %s",
      async (amount) => {
        ledgerTxn = {
          ...ledgerTxn,
          displayAmount: undefined,
          displayFee: undefined,
          ...(currency === WalletCurrency.Btc
            ? { satsAmount: amount as Satoshis }
            : { centsAmount: amount as UsdCents }),
        }

        expect(await settlePayout(payoutId)).toBeInstanceOf(BigIntFloatConversionError)
        expectNoNotification()
      },
    )
  },
)
