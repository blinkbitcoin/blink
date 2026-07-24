import crypto from "crypto"

import { UsdDisplayCurrency } from "@/domain/fiat"
import { BtcWalletDescriptor, WalletCurrency } from "@/domain/shared"

import { CsvWalletsExport } from "@/services/ledger/csv-wallet-export"

import { createMandatoryUsers, createRandomUserAndBtcWallet } from "test/helpers"
import { recordReceiveLnPayment } from "test/helpers/ledger"

beforeAll(async () => {
  await createMandatoryUsers()
})

describe("CsvWalletsExport", () => {
  const csvHeader =
    "id,walletId,type,credit,debit,fee,currency,timestamp,pendingConfirmation,journalId,lnMemo,usd,feeUsd,recipientWalletId,username,memoFromPayer,paymentHash,pubkey,feeKnownInAdvance,address,txHash"

  it("exports to csv", async () => {
    const newWalletDescriptor = await createRandomUserAndBtcWallet()

    const csv = new CsvWalletsExport()
    await csv.addWallet(newWalletDescriptor.id)
    const base64Data = csv.getBase64()
    expect(typeof base64Data).toBe("string")
    const data = Buffer.from(base64Data, "base64")
    expect(data.includes(csvHeader)).toBeTruthy()
  })

  it("populates fee columns from satsFee/centsFee/centsAmount", async () => {
    const walletDescriptor = BtcWalletDescriptor(crypto.randomUUID() as WalletId)

    const res = await recordReceiveLnPayment({
      walletDescriptor,
      paymentAmount: {
        usd: { amount: 100n, currency: WalletCurrency.Usd },
        btc: { amount: 300n, currency: WalletCurrency.Btc },
      },
      bankFee: {
        usd: { amount: 10n, currency: WalletCurrency.Usd },
        btc: { amount: 30n, currency: WalletCurrency.Btc },
      },
      displayAmounts: {
        amountDisplayCurrency: 100 as DisplayCurrencyBaseAmount,
        feeDisplayCurrency: 10 as DisplayCurrencyBaseAmount,
        displayCurrency: UsdDisplayCurrency,
      },
    })
    if (res instanceof Error) throw res

    const csv = new CsvWalletsExport()
    await csv.addWallet(walletDescriptor.id)
    const data = Buffer.from(csv.getBase64(), "base64").toString("utf8")

    const [headerLine, ...rows] = data.split("\n").filter((line) => line.length > 0)
    const headers = headerLine.split(",")
    expect(rows.length).toEqual(1)

    const cells = rows[0].split(",")
    expect(cells[headers.indexOf("fee")]).toEqual("30")
    expect(cells[headers.indexOf("feeUsd")]).toEqual("0.1")
    expect(cells[headers.indexOf("usd")]).toEqual("1")
  })
})
