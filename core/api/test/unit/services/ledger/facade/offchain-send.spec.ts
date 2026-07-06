const mockPersistAndReturnEntry = jest.fn()

jest.mock("@/services/ledger/helpers", () => ({
  ...jest.requireActual("@/services/ledger/helpers"),
  persistAndReturnEntry: (args: unknown) => mockPersistAndReturnEntry(args),
}))

jest.mock("@/services/ledger/facade/static-account-ids", () => ({
  staticAccountIds: async () => ({
    bankOwnerAccountId: "bank-owner-account",
    dealerBtcAccountId: "dealer-btc-account",
    dealerUsdAccountId: "dealer-usd-account",
  }),
}))

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { WalletCurrency } from "@/domain/shared"

import { recordLnFailedUsdSendRefund } from "@/services/ledger/facade/offchain-send"

describe("recordLnFailedUsdSendRefund", () => {
  const recipientWalletDescriptor = {
    id: "recipient-wallet" as WalletId,
    currency: WalletCurrency.Btc,
    accountId: "recipient-account" as AccountId,
  }

  const total = { amount: 10_000n, currency: WalletCurrency.Btc } as BtcPaymentAmount
  const usdTotal = { amount: 500n, currency: WalletCurrency.Usd } as UsdPaymentAmount

  beforeEach(() => {
    mockPersistAndReturnEntry.mockReset()
  })

  it("returns an error and persists nothing when the service fee exceeds the total", async () => {
    const result = await recordLnFailedUsdSendRefund({
      description: "refund",
      recipientWalletDescriptor,
      amountToCreditReceiver: { btc: total, usd: usdTotal },
      btcBankFee: { amount: 10_001n, currency: WalletCurrency.Btc } as BtcPaymentAmount,
      metadata: {} as unknown as ReceiveLedgerMetadata,
      additionalCreditMetadata: {} as TxMetadata,
      additionalInternalMetadata: {} as TxMetadata,
    })

    expect(result).toBeInstanceOf(InvalidLedgerTransactionStateError)
    expect(mockPersistAndReturnEntry).not.toHaveBeenCalled()
  })
})
