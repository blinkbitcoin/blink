import { Types } from "mongoose"

import { getCurrentPriceAsDisplayPriceRatio } from "@/app/prices/get-current-price"
import { toSats } from "@/domain/bitcoin"
import { CacheKeys } from "@/domain/cache"
import { getCurrencyMajorExponent } from "@/domain/fiat"
import { LedgerTransactionType } from "@/domain/ledger"
import { PriceCurrenciesNotAvailableError } from "@/domain/price"
import { WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"
import { WalletTransactionHistory } from "@/domain/wallets"
import { LocalCacheService } from "@/services/cache/local-cache"
import { WalletIdIntraledgerLedgerMetadata } from "@/services/ledger/facade/tx-metadata"
import { Transaction } from "@/services/ledger/schema"
import { translateToLedgerTx } from "@/services/ledger/translate"
import { walletTransactionToNotificationEventRequest } from "@/services/notifications/convert"
import { TransactionType } from "@/services/notifications/proto/notifications_pb"
import { PriceService } from "@/services/price"
import { recordExceptionInCurrentSpan } from "@/services/tracing"

jest.mock("@/config", () => ({ RATIO_PRECISION: 1_000_000, SECS_PER_10_MINS: 600 }))
jest.mock("@/domain/notifications", () => ({}))
jest.mock("@/services/price", () => ({ PriceService: jest.fn() }))
jest.mock("@/services/tracing", () => ({
  recordExceptionInCurrentSpan: jest.fn(),
  /* eslint @typescript-eslint/ban-ts-comment: "off" */
  // @ts-ignore-next-line no-implicit-any error
  wrapAsyncFunctionsToRunInSpan: ({ fns }) => fns,
}))

const PKR = "PKR" as DisplayCurrency
const priceService = PriceService as jest.MockedFunction<typeof PriceService>
const recordException = recordExceptionInCurrentSpan as jest.MockedFunction<
  typeof recordExceptionInCurrentSpan
>
const listCurrencies = jest.fn()
const getSatRealTimePrice = jest.fn()

describe("payment display-currency precision", () => {
  beforeEach(async () => {
    await Promise.all([
      LocalCacheService().clear({ key: CacheKeys.CurrentSatPrice }),
      LocalCacheService().clear({ key: CacheKeys.PriceCurrencies }),
    ])

    listCurrencies.mockResolvedValue([
      {
        code: PKR,
        symbol: "₨",
        name: "Pakistani Rupee",
        flag: "🇵🇰",
        fractionDigits: 2,
        countryCodes: ["PK"],
      },
    ])
    getSatRealTimePrice.mockResolvedValue({
      timestamp: new Date(),
      price: 0.2197,
      currency: PKR,
    })

    priceService.mockReturnValue({
      listHistory: jest.fn(),
      listCurrencies,
      getSatRealTimePrice,
      getUsdCentRealTimePrice: jest.fn(),
    })
    recordException.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("preserves PKR precision from payment pricing through notification protobuf", async () => {
    const displayPriceRatio = await getCurrentPriceAsDisplayPriceRatio({
      currency: PKR,
    })
    if (displayPriceRatio instanceof Error) throw displayPriceRatio

    const btcPaymentAmount: BtcPaymentAmount = {
      amount: 100n,
      currency: WalletCurrency.Btc,
    }
    const displayAmount = displayPriceRatio.convertFromWallet(btcPaymentAmount)

    const { creditAccountAdditionalMetadata } = WalletIdIntraledgerLedgerMetadata({
      paymentAmounts: {
        btcPaymentAmount,
        usdPaymentAmount: { amount: 10n, currency: WalletCurrency.Usd },
        btcProtocolAndBankFee: ZERO_SATS,
        usdProtocolAndBankFee: ZERO_CENTS,
      },
      senderAmountDisplayCurrency: Number(
        displayAmount.amountInMinor,
      ) as DisplayCurrencyBaseAmount,
      senderFeeDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
      senderDisplayCurrency: PKR,
      senderDisplayCurrencyFractionDigits: displayPriceRatio.fractionDigits,
      recipientAmountDisplayCurrency: Number(
        displayAmount.amountInMinor,
      ) as DisplayCurrencyBaseAmount,
      recipientFeeDisplayCurrency: 0 as DisplayCurrencyBaseAmount,
      recipientDisplayCurrency: PKR,
      recipientDisplayCurrencyFractionDigits: displayPriceRatio.fractionDigits,
    })

    const walletId = "walletId" as WalletId
    const ledgerTransaction = translateToLedgerTx<"BTC", DisplayCurrency>(
      new Transaction({
        _id: new Types.ObjectId(),
        accounts: walletId,
        account_path: [],
        book: "MainBook",
        memo: "",
        datetime: new Date(),
        timestamp: new Date(),
        _journal: new Types.ObjectId(),
        type: LedgerTransactionType.IntraLedger,
        debit: 0,
        credit: 100,
        currency: WalletCurrency.Btc,
        pending: false,
        feeKnownInAdvance: true,
        satsAmount: 100,
        centsAmount: 10,
        satsFee: 0,
        centsFee: 0,
        ...creditAccountAdditionalMetadata,
      }).toObject(),
    )

    const transaction = WalletTransactionHistory.fromLedger({
      txn: ledgerTransaction,
      nonEndUserWalletIds: [],
      memoSharingConfig: {
        memoSharingCentsThreshold: 0 as UsdCents,
        memoSharingSatsThreshold: toSats(0),
        authorizedMemos: [],
      },
    })
    const { settlementDisplayCurrencyFractionDigits } = transaction
    if (settlementDisplayCurrencyFractionDigits === undefined) {
      throw new Error("expected persisted display-currency fraction digits")
    }

    expect(displayPriceRatio.fractionDigits).toBe(2)
    expect(displayAmount.displayInMajor).toBe("21.97")
    expect(ledgerTransaction.displayCurrencyFractionDigits).toBe(2)
    expect(transaction.settlementDisplayAmount).toBe("21.97")
    expect(settlementDisplayCurrencyFractionDigits).toBe(2)

    const request = walletTransactionToNotificationEventRequest({
      userId: "userId" as UserId,
      transaction,
      type: TransactionType.INTRA_LEDGER_RECEIPT,
      fractionDigits: settlementDisplayCurrencyFractionDigits,
    })

    expect(
      request.getEvent()?.getTransactionOccurred()?.getDisplayAmount()?.getMinorUnits(),
    ).toBe(2197)
  })

  it("falls back to ICU precision when currency metadata is unavailable", async () => {
    listCurrencies.mockResolvedValueOnce(new PriceCurrenciesNotAvailableError())

    const displayPriceRatio = await getCurrentPriceAsDisplayPriceRatio({ currency: PKR })
    if (displayPriceRatio instanceof Error) throw displayPriceRatio

    expect(displayPriceRatio.fractionDigits).toBe(getCurrencyMajorExponent(PKR))
    expect(recordException).toHaveBeenCalledTimes(1)
    expect(
      displayPriceRatio.convertFromWallet({
        amount: 100n,
        currency: WalletCurrency.Btc,
      }).displayInMajor,
    ).toBe("22")
  })

  it("falls back to ICU precision when the currency metadata record is missing", async () => {
    listCurrencies.mockResolvedValueOnce([])

    const displayPriceRatio = await getCurrentPriceAsDisplayPriceRatio({ currency: PKR })
    if (displayPriceRatio instanceof Error) throw displayPriceRatio

    expect(displayPriceRatio.fractionDigits).toBe(getCurrencyMajorExponent(PKR))
  })
})
