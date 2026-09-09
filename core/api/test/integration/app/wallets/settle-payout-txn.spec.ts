import { settlePayout } from "@/app/wallets"

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

import * as LedgerFacadeImpl from "@/services/ledger/facade"

import { createMandatoryUsers, createRandomUserAndBtcWallet } from "test/helpers"

beforeAll(async () => {
  await createMandatoryUsers()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("settlePayout", () => {
  it("refuses a payout whose ledger row has no display currency", async () => {
    // The row's display currency is required: without it the notification
    // would silently label the payout in the default currency.
    const walletDescriptor = await createRandomUserAndBtcWallet()
    jest.spyOn(LedgerFacadeImpl, "settlePendingOnChainPayment").mockResolvedValue({
      walletId: walletDescriptor.id,
      currency: WalletCurrency.Btc,
      satsAmount: 1000,
      journalId: "journalId" as LedgerJournalId,
      displayAmount: 10,
      displayCurrency: undefined,
    } as unknown as LedgerTransaction<WalletCurrency>)

    const result = await settlePayout("payoutId" as PayoutId)

    expect(result).toBeInstanceOf(InvalidLedgerTransactionStateError)
  })
})
