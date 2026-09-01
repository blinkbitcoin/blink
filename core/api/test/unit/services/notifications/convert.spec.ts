import { WalletCurrency } from "@/domain/shared"
import { walletTransactionToNotificationEventRequest } from "@/services/notifications/convert"
import { TransactionType } from "@/services/notifications/proto/notifications_pb"

jest.mock("@/domain/notifications", () => ({}))

describe("walletTransactionToNotificationEventRequest", () => {
  it.each([
    { currency: "PKR", amountInMajor: "21.97", fractionDigits: 2, expected: 2197 },
    { currency: "RSD", amountInMajor: "100", fractionDigits: 0, expected: 100 },
  ])(
    "serializes $currency display amounts using price-service fraction digits",
    ({ currency, amountInMajor, fractionDigits, expected }) => {
      const displayCurrency = currency as DisplayCurrency
      const request = walletTransactionToNotificationEventRequest({
        userId: "userId" as UserId,
        type: TransactionType.INTRA_LEDGER_RECEIPT,
        fractionDigits,
        transaction: {
          settlementAmount: 100 as Satoshis,
          settlementCurrency: WalletCurrency.Btc,
          settlementDisplayAmount: amountInMajor as DisplayCurrencyMajorAmount,
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
    },
  )
})
