import {
  BulletinCloseReason,
  InvalidArgumentNotificationsServiceError,
  InvalidBulletinCloseReasonNotificationsServiceError,
  InvalidDisplayAmountError,
  UnknownNotificationsServiceError,
} from "@/domain/notifications"
import { WalletCurrency } from "@/domain/shared"
import {
  grpcBulletinCloseReasonToBulletinCloseReason,
  grpcBulletinToNotificationBulletin,
  walletTransactionToNotificationEventRequest,
} from "@/services/notifications/convert"
import {
  handleBulletinNotificationErrors,
  handleCommonNotificationErrors,
} from "@/services/notifications/errors"
import {
  Bulletin,
  BulletinCloseReason as GrpcBulletinCloseReason,
  TransactionType,
} from "@/services/notifications/proto/notifications_pb"
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

describe("grpcBulletinToNotificationBulletin", () => {
  const buildBulletin = (acknowledgedAt?: number) => {
    const bulletin = new Bulletin()
    bulletin.setId("bulletin-id")
    bulletin.setUserId("user-id")
    bulletin.setCreatedAt(1700000000)
    if (acknowledgedAt) bulletin.setAcknowledgedAt(acknowledgedAt)
    return bulletin
  }

  it("translates an open bulletin", () => {
    expect(grpcBulletinToNotificationBulletin(buildBulletin())).toEqual({
      id: "bulletin-id",
      userId: "user-id",
      createdAt: new Date(1700000000 * 1000),
      acknowledgedAt: undefined,
      closeReason: undefined,
    })
  })

  it("translates an acknowledged bulletin", () => {
    const bulletin = buildBulletin(1700000100)
    bulletin.setCloseReason(GrpcBulletinCloseReason.CLOSED)
    const result = grpcBulletinToNotificationBulletin(bulletin)
    expect(result).toHaveProperty("acknowledgedAt", new Date(1700000100 * 1000))
    expect(result).toHaveProperty("closeReason", BulletinCloseReason.Closed)
  })

  it("fails to translate a bulletin - unknown close reason", () => {
    const bulletin = buildBulletin(1700000100)
    bulletin.setCloseReason(99 as GrpcBulletinCloseReason)
    expect(grpcBulletinToNotificationBulletin(bulletin)).toBeInstanceOf(
      InvalidBulletinCloseReasonNotificationsServiceError,
    )
  })
})

describe("grpcBulletinCloseReasonToBulletinCloseReason", () => {
  it.each([
    [GrpcBulletinCloseReason.ACKNOWLEDGED, BulletinCloseReason.Acknowledged],
    [GrpcBulletinCloseReason.CLOSED, BulletinCloseReason.Closed],
    [GrpcBulletinCloseReason.REPLACED, BulletinCloseReason.Replaced],
    [GrpcBulletinCloseReason.SUPERSEDED, BulletinCloseReason.Superseded],
  ])("translates %s", (grpcCloseReason, closeReason) => {
    expect(grpcBulletinCloseReasonToBulletinCloseReason(grpcCloseReason)).toEqual(
      closeReason,
    )
  })
})

describe("handleBulletinNotificationErrors", () => {
  it("maps an invalid argument to a validation error without the grpc prefix", () => {
    const error = handleBulletinNotificationErrors(
      new Error("3 INVALID_ARGUMENT: too many user ids: 101"),
    )
    expect(error).toBeInstanceOf(InvalidArgumentNotificationsServiceError)
    expect(error.message).toEqual("too many user ids: 101")
    expect(error.level).not.toEqual("critical")
  })

  it("maps an unknown error to an unknown service error", () => {
    expect(
      handleBulletinNotificationErrors(new Error("13 INTERNAL: boom")),
    ).toBeInstanceOf(UnknownNotificationsServiceError)
  })
})

describe("handleCommonNotificationErrors", () => {
  it("keeps an invalid argument as an unknown service error", () => {
    expect(
      handleCommonNotificationErrors(
        new Error("3 INVALID_ARGUMENT: invalid fraction digits"),
      ),
    ).toBeInstanceOf(UnknownNotificationsServiceError)
  })
})
