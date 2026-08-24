import { createObjectCsvStringifier, createObjectCsvWriter } from "csv-writer"

import { WalletCurrency } from "@/domain/shared"
import { LedgerService } from "@/services/ledger"
import { baseLogger } from "@/services/logger"

const centsToDollars = (cents: UsdCents): number => Number(cents) / 100

const headers_field = [
  "id",
  "walletId",
  "type",
  "credit",
  "debit",
  "fee",
  "currency",
  "timestamp",
  "pendingConfirmation",
  "journalId",
  "lnMemo",
  "usd",
  "feeUsd",
  "recipientWalletId",
  "username",
  "memoFromPayer",
  "paymentHash",
  "pubkey",
  "feeKnownInAdvance",
  "address",
  "txHash",
  "displayAmount",
  "displayFee",
  "displayCurrency",
]

const header = headers_field.map((item) => ({ id: item, title: item }))

// 2022-era backfill migrations left NaN in satsFee/centsFee/centsAmount where
// the legacy source fields were absent, so presence alone is not enough
const isRecorded = (amount: number | undefined): amount is number =>
  Number.isFinite(amount)

// The legacy fee/feeUsd/usd ledger fields are only written by admin entries;
// user transactions carry satsFee/centsFee/centsAmount instead. Like credit
// and debit, the fee column is denominated in the row's wallet currency.
const toCsvRecord = (tx: LedgerTransaction<WalletCurrency>) => {
  const walletFee = tx.currency === WalletCurrency.Usd ? tx.centsFee : tx.satsFee

  return {
    ...tx,
    fee: isRecorded(walletFee) ? walletFee : tx.fee,
    feeUsd: isRecorded(tx.centsFee) ? centsToDollars(tx.centsFee) : tx.feeUsd,
    usd: isRecorded(tx.centsAmount) ? centsToDollars(tx.centsAmount) : tx.usd,
  }
}

export class CsvWalletsExport {
  entries: LedgerTransaction<WalletCurrency>[] = []

  getBase64(): string {
    const csvWriter = createObjectCsvStringifier({
      header,
    })

    const header_stringify = csvWriter.getHeaderString()
    const records = csvWriter.stringifyRecords(this.entries.map(toCsvRecord))

    const str = header_stringify + records

    // create buffer from string
    const binaryData = Buffer.from(str, "utf8")

    // decode buffer as base64
    const base64Data = binaryData.toString("base64")

    return base64Data
  }

  async saveToDisk(): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: "export_accounts.csv",
      header,
    })

    await csvWriter.writeRecords(this.entries.map(toCsvRecord))
    baseLogger.info("saving complete")
  }

  async addWallet(walletId: WalletId): Promise<void | ApplicationError> {
    // TODO: interface could be improved by returning self, so that it's
    // possible to run csv.addWallet(wallet).getBase64()
    const txs = await LedgerService().getTransactionsByWalletId(walletId)
    if (txs instanceof Error) return txs

    this.entries.push(...txs)
  }
}
