import { AccountLevel } from "@/domain/accounts"
import { displayCurrencyPerBaseUnitFromAmounts } from "@/domain/wallets/tx-history"
import { WalletCurrency } from "@/domain/shared"
import { toSats } from "@/domain/bitcoin"

import { NotificationsService } from "@/services/notifications"
import * as notificationsGrpc from "@/services/notifications/grpc-client"
import { HandleNotificationEventResponse } from "@/services/notifications/proto/notifications_pb"

import { waitForNotificationsService } from "test/helpers"

beforeAll(async () => {
  await waitForNotificationsService()
})

describe("NotificationsService", () => {
  describe("sendTransaction", () => {
    const walletId = "walletId" as WalletId
    const recipient = {
      accountId: "AccountId" as AccountId,
      walletId,
      userId: "UserId" as UserId,
      level: AccountLevel.One,
      status: "active" as const,
    }
    const transactionFor = ({
      displayCurrency,
      displayAmountInMinor,
      displayAmountInMajor,
      displayCurrencyFractionDigits,
      settlementAmount,
    }: {
      displayCurrency: DisplayCurrency
      displayAmountInMinor: number
      displayAmountInMajor: DisplayCurrencyMajorAmount
      displayCurrencyFractionDigits?: number
      settlementAmount: Satoshis
    }): WalletTransaction => ({
      id: "id" as LedgerTransactionId,
      status: "success",
      memo: "",
      walletId,
      externalId: "externalId" as LedgerExternalId,
      initiationVia: { type: "onchain" },
      settlementVia: {
        type: "intraledger",
        counterPartyWalletId: "counterPartyWalletId" as WalletId,
        counterPartyUsername: "counterPartyUsername" as Username,
      },
      settlementAmount,
      settlementCurrency: WalletCurrency.Btc,
      settlementFee: toSats(0),
      settlementDisplayAmount: displayAmountInMajor,
      settlementDisplayCurrencyFractionDigits: displayCurrencyFractionDigits,
      settlementDisplayPrice: displayCurrencyPerBaseUnitFromAmounts({
        displayCurrency,
        displayAmount: displayAmountInMinor,
        walletAmount: Math.abs(settlementAmount),
        walletCurrency: WalletCurrency.Btc,
      }),
      settlementDisplayFee: "0.00" as DisplayCurrencyMajorAmount,
      createdAt: new Date(),
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it("should send a notification", async () => {
      const result = await NotificationsService().sendTransaction({
        recipient,
        transaction: transactionFor({
          displayCurrency: "CRC" as DisplayCurrency,
          displayAmountInMinor: 350_050,
          displayAmountInMajor: "3500.50" as DisplayCurrencyMajorAmount,
          displayCurrencyFractionDigits: 2,
          settlementAmount: toSats(-1000),
        }),
      })
      expect(result).not.toBeInstanceOf(Error)
    })

    it("serializes COP display amounts using the transaction precision", async () => {
      const COP = "COP" as DisplayCurrency

      const handleNotificationEvent = jest
        .spyOn(notificationsGrpc, "handleNotificationEvent")
        .mockResolvedValue(new HandleNotificationEventResponse())

      const result = await NotificationsService().sendTransaction({
        recipient,
        transaction: transactionFor({
          displayCurrency: COP,
          displayAmountInMinor: 103_900_513,
          displayAmountInMajor: "1039005.13" as DisplayCurrencyMajorAmount,
          displayCurrencyFractionDigits: 2,
          settlementAmount: toSats(-100),
        }),
      })

      expect(result).not.toBeInstanceOf(Error)
      const request = handleNotificationEvent.mock.calls[0]?.[0]
      const displayAmount = request
        ?.getEvent()
        ?.getTransactionOccurred()
        ?.getDisplayAmount()
      expect(displayAmount?.getCurrencyCode()).toBe(COP)
      expect(displayAmount?.getMinorUnits()).toBe(103900513)
      expect(displayAmount?.getFractionDigits()).toBe(2)
    })

    it("sends a push without querying currency metadata", async () => {
      const handleNotificationEvent = jest
        .spyOn(notificationsGrpc, "handleNotificationEvent")
        .mockResolvedValue(new HandleNotificationEventResponse())

      const result = await NotificationsService().sendTransaction({
        recipient,
        transaction: transactionFor({
          displayCurrency: "ZZZ" as DisplayCurrency,
          displayAmountInMinor: 100,
          displayAmountInMajor: "1.00" as DisplayCurrencyMajorAmount,
          settlementAmount: toSats(-100),
        }),
      })

      expect(result).not.toBeInstanceOf(Error)
      expect(handleNotificationEvent).toHaveBeenCalledTimes(1)
    })
  })
})
