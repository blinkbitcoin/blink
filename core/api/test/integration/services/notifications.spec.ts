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
    afterEach(() => {
      jest.restoreAllMocks()
    })

    it("should send a notification", async () => {
      const accountId = "AccountId" as AccountId
      const walletId = "walletId" as WalletId
      const userId = "UserId" as UserId

      const paymentAmount = {
        amount: 1000n,
        currency: WalletCurrency.Btc,
        settlementAmount: toSats(-1000),
        settlementAmountSend: toSats(-1000),
        settlementFee: toSats(0),
        settlementDisplayFee: "0",
      }
      const crcDisplayPaymentAmount = {
        amountInMinor: 350050n,
        currency: "CRC" as DisplayCurrency,
        displayInMajor: "3500.50",
      }
      const crcSettlementDisplayPrice = <S extends WalletCurrency>({
        walletAmount,
        walletCurrency,
      }: {
        walletAmount: number
        walletCurrency: S
      }) =>
        displayCurrencyPerBaseUnitFromAmounts({
          displayCurrency: crcDisplayPaymentAmount.currency,
          displayAmount: Number(crcDisplayPaymentAmount.amountInMinor),
          walletAmount,
          walletCurrency,
        })

      const result = await NotificationsService().sendTransaction({
        recipient: {
          accountId,
          walletId,
          userId,
          level: AccountLevel.One,
          status: "active",
        },
        transaction: {
          id: "id" as LedgerTransactionId,
          status: "success",
          memo: "",
          walletId,
          externalId: "externalId" as LedgerExternalId,
          initiationVia: {
            type: "onchain",
          },
          settlementVia: {
            type: "intraledger",
            counterPartyWalletId: "counterPartyWalletId" as WalletId,
            counterPartyUsername: "counterPartyUsername" as Username,
          },
          settlementAmount: paymentAmount.settlementAmount,
          settlementCurrency: paymentAmount.currency,
          settlementFee: paymentAmount.settlementFee,
          settlementDisplayAmount: crcDisplayPaymentAmount.displayInMajor,
          settlementDisplayCurrencyFractionDigits: 2,
          settlementDisplayPrice: crcSettlementDisplayPrice({
            walletAmount: toSats(paymentAmount.amount),
            walletCurrency: paymentAmount.currency,
          }),
          settlementDisplayFee: paymentAmount.settlementDisplayFee,
          createdAt: new Date(),
        },
      })
      expect(result).not.toBeInstanceOf(Error)
    })

    it("serializes legacy display amounts using the historical ICU precision", async () => {
      const PKR = "PKR" as DisplayCurrency

      const handleNotificationEvent = jest
        .spyOn(notificationsGrpc, "handleNotificationEvent")
        .mockResolvedValue(new HandleNotificationEventResponse())

      const walletId = "walletId" as WalletId
      const result = await NotificationsService().sendTransaction({
        recipient: {
          accountId: "AccountId" as AccountId,
          walletId,
          userId: "UserId" as UserId,
          level: AccountLevel.One,
          status: "active",
        },
        transaction: {
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
          settlementAmount: toSats(-100),
          settlementCurrency: WalletCurrency.Btc,
          settlementFee: toSats(0),
          settlementDisplayAmount: "22" as DisplayCurrencyMajorAmount,
          settlementDisplayPrice: displayCurrencyPerBaseUnitFromAmounts({
            displayCurrency: PKR,
            displayAmount: 22,
            walletAmount: 100,
            walletCurrency: WalletCurrency.Btc,
          }),
          settlementDisplayFee: "0" as DisplayCurrencyMajorAmount,
          createdAt: new Date(),
        },
      })

      expect(result).not.toBeInstanceOf(Error)
      const request = handleNotificationEvent.mock.calls[0]?.[0]
      const displayAmount = request
        ?.getEvent()
        ?.getTransactionOccurred()
        ?.getDisplayAmount()
      expect(displayAmount?.getCurrencyCode()).toBe(PKR)
      expect(displayAmount?.getMinorUnits()).toBe(22)
    })
  })
})
