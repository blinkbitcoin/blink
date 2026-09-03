import { WalletCurrency } from "@/domain/shared"
import { walletTransactionToNotificationEventRequest } from "@/services/notifications/convert"
import { TransactionType } from "@/services/notifications/proto/notifications_pb"

jest.mock("@/domain/notifications", () => ({}))

describe("walletTransactionToNotificationEventRequest", () => {
  it.each([
    {
      currency: "COP",
      amountInMajor: "1039005.13",
      fractionDigits: 2,
      expected: 103900513,
    },
    { currency: "XTS", amountInMajor: "100", fractionDigits: 0, expected: 100 },
  ])(
    "serializes $currency display amounts using their canonical major-unit scale",
    ({ currency, amountInMajor, fractionDigits, expected }) => {
      const displayCurrency = currency as DisplayCurrency
      const request = walletTransactionToNotificationEventRequest({
        userId: "userId" as UserId,
        type: TransactionType.INTRA_LEDGER_RECEIPT,
        transaction: {
          settlementAmount: 100 as Satoshis,
          settlementCurrency: WalletCurrency.Btc,
          settlementDisplayAmount: amountInMajor as DisplayCurrencyMajorAmount,
          settlementDisplayCurrencyFractionDigits: fractionDigits,
          settlementDisplayPrice: {
            base: 1n,
            offset: 0n,
            displayCurrency,
            walletCurrency: WalletCurrency.Btc,
          },
        },
      })

      const displayAmount = request
        .getEvent()
        ?.getTransactionOccurred()
        ?.getDisplayAmount()
      expect(displayAmount?.getCurrencyCode()).toBe(displayCurrency)
      expect(displayAmount?.getMinorUnits()).toBe(expected)
      expect(displayAmount?.hasFractionDigits()).toBe(true)
      expect(displayAmount?.getFractionDigits()).toBe(fractionDigits)
    },
  )

  it("infers precision for legacy transactions without persisted digits", () => {
    const request = walletTransactionToNotificationEventRequest({
      userId: "userId" as UserId,
      type: TransactionType.INTRA_LEDGER_RECEIPT,
      transaction: {
        settlementAmount: 100 as Satoshis,
        settlementCurrency: WalletCurrency.Btc,
        settlementDisplayAmount: "1.00" as DisplayCurrencyMajorAmount,
        settlementDisplayPrice: {
          base: 1n,
          offset: 0n,
          displayCurrency: "ZZZ" as DisplayCurrency,
          walletCurrency: WalletCurrency.Btc,
        },
      },
    })

    const displayAmount = request.getEvent()?.getTransactionOccurred()?.getDisplayAmount()
    expect(displayAmount?.getMinorUnits()).toBe(100)
    expect(displayAmount?.getFractionDigits()).toBe(2)
  })
})
