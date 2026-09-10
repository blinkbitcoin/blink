import { InvalidDisplayAmountError } from "@/domain/notifications"
import { WalletCurrency } from "@/domain/shared"
import { walletTransactionToNotificationEventRequest } from "@/services/notifications/convert"
import { TransactionType } from "@/services/notifications/proto/notifications_pb"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
}))

const mockRecordExceptionInCurrentSpan = recordExceptionInCurrentSpan as jest.Mock

const buildRequest = ({
  displayCurrency,
  amountInMajor,
  fractionDigits,
}: {
  displayCurrency: DisplayCurrency
  amountInMajor: string
  fractionDigits?: number
}) =>
  walletTransactionToNotificationEventRequest({
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

afterEach(() => {
  jest.clearAllMocks()
})

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
      const request = buildRequest({ displayCurrency, amountInMajor, fractionDigits })
      if (request instanceof Error) throw request

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
    const request = buildRequest({
      displayCurrency: "ZZZ" as DisplayCurrency,
      amountInMajor: "1.00",
    })
    if (request instanceof Error) throw request

    const displayAmount = request.getEvent()?.getTransactionOccurred()?.getDisplayAmount()
    expect(displayAmount?.getMinorUnits()).toBe(100)
    expect(displayAmount?.getFractionDigits()).toBe(2)
  })

  it("infers zero digits from an integer-formatted legacy display amount", () => {
    const request = buildRequest({
      displayCurrency: "ZZZ" as DisplayCurrency,
      amountInMajor: "22",
    })
    if (request instanceof Error) throw request

    const displayAmount = request.getEvent()?.getTransactionOccurred()?.getDisplayAmount()
    expect(displayAmount?.getMinorUnits()).toBe(22)
    expect(displayAmount?.getFractionDigits()).toBe(0)
  })

  it("degrades out-of-range persisted digits to the ICU exponent instead of a rejected request", () => {
    // The notifications service rejects fraction_digits above the shared bound;
    // the sender must never build a request it would reject, because no caller
    // retries a dropped notification.
    const request = buildRequest({
      displayCurrency: "USD" as DisplayCurrency,
      amountInMajor: "21.97",
      fractionDigits: 8,
    })
    if (request instanceof Error) throw request

    const displayAmount = request.getEvent()?.getTransactionOccurred()?.getDisplayAmount()
    expect(displayAmount?.getFractionDigits()).toBe(2)
    expect(displayAmount?.getMinorUnits()).toBe(2197)
    expect(mockRecordExceptionInCurrentSpan).toHaveBeenCalledWith(
      expect.objectContaining({ level: "warn" }),
    )
  })

  it.each(["1e-7", "1,039.00", ""])(
    "rejects the non-fixed-point display amount %j instead of scraping it",
    (amountInMajor) => {
      const request = buildRequest({
        displayCurrency: "USD" as DisplayCurrency,
        amountInMajor,
      })

      expect(request).toBeInstanceOf(InvalidDisplayAmountError)
    },
  )
})
