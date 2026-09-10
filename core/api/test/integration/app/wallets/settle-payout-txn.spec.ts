import { settlePayout } from "@/app/wallets"
import * as WalletTransactionImpl from "@/app/wallets/get-transaction-by-journal-id"

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

import * as LedgerFacadeImpl from "@/services/ledger/facade"
import * as NotificationsServiceImpl from "@/services/notifications"

import { createMandatoryUsers, createRandomUserAndBtcWallet } from "test/helpers"

beforeAll(async () => {
  await createMandatoryUsers()
})

afterEach(() => {
  jest.restoreAllMocks()
})

const mockPayout = async (displayCurrency: DisplayCurrency | undefined) => {
  const walletDescriptor = await createRandomUserAndBtcWallet()
  const txHash = "a".repeat(64) as OnChainTxHash
  const journalId = "journalId" as LedgerJournalId
  jest.spyOn(LedgerFacadeImpl, "settlePendingOnChainPayment").mockResolvedValue({
    walletId: walletDescriptor.id,
    currency: WalletCurrency.Btc,
    satsAmount: 1000,
    journalId,
    txHash,
    displayAmount: 10,
    displayCurrency,
  } as unknown as LedgerTransaction<WalletCurrency>)

  // Keep later dependencies successful so another guard cannot mask this one.
  const walletTransaction = {
    id: journalId,
    settlementDisplayCurrency: displayCurrency,
  } as unknown as WalletTransaction
  const getTransaction = jest
    .spyOn(WalletTransactionImpl, "getTransactionForWalletByJournalId")
    .mockResolvedValue(walletTransaction)
  const sendTransaction = jest.fn().mockResolvedValue(undefined)
  jest.spyOn(NotificationsServiceImpl, "NotificationsService").mockReturnValue({
    sendTransaction,
  } as unknown as INotificationsService)

  return {
    walletDescriptor,
    journalId,
    walletTransaction,
    getTransaction,
    sendTransaction,
  }
}

describe("settlePayout", () => {
  it("refuses a payout whose ledger row has no display currency", async () => {
    // The row's display currency is required: without it the notification
    // would silently label the payout in the default currency.
    const { getTransaction, sendTransaction } = await mockPayout(undefined)

    const result = await settlePayout("payoutId" as PayoutId)

    expect(result).toBeInstanceOf(InvalidLedgerTransactionStateError)
    expect(getTransaction).not.toHaveBeenCalled()
    expect(sendTransaction).not.toHaveBeenCalled()
  })

  it("notifies for the same payout when its ledger row has a display currency", async () => {
    const {
      walletDescriptor,
      journalId,
      walletTransaction,
      getTransaction,
      sendTransaction,
    } = await mockPayout("EUR" as DisplayCurrency)

    const result = await settlePayout("payoutId" as PayoutId)

    expect(result).toBe(true)
    expect(getTransaction).toHaveBeenCalledWith({
      walletId: walletDescriptor.id,
      journalId,
    })
    expect(sendTransaction).toHaveBeenCalledTimes(1)
    expect(sendTransaction).toHaveBeenCalledWith({
      recipient: expect.objectContaining({ walletId: walletDescriptor.id }),
      transaction: walletTransaction,
    })
  })
})
