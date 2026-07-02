import { MainBook, Transaction } from "../books"

import { EntryBuilder, lndLedgerAccountId, toLedgerAccountDescriptor } from "../domain"
import { NoTransactionToSettleError } from "../domain/errors"
import { TransactionsMetadataRepository } from "../services"
import { persistAndReturnEntry } from "../helpers"

import { translateToLedgerJournal } from ".."

import { staticAccountIds } from "./static-account-ids"

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { UnknownLedgerError } from "@/domain/ledger"
import { AmountCalculator, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"

const calc = AmountCalculator()

export const recordSendOffChain = async ({
  description,
  senderWalletDescriptor,
  amountToDebitSender,
  bankFee,
  metadata,
  additionalDebitMetadata,
  additionalInternalMetadata,
}: RecordSendArgs) => {
  const actualFee = bankFee || { usd: ZERO_CENTS, btc: ZERO_SATS }
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  let entry = MainBook.entry(description)
  const builder = EntryBuilder({
    staticAccountIds: accountIds,
    entry,
    metadata,
    additionalInternalMetadata,
  })

  entry = builder
    .withTotalAmount({
      usdWithFees: amountToDebitSender.usd,
      btcWithFees: amountToDebitSender.btc,
    })
    .withBankFee({ usdBankFee: actualFee.usd, btcBankFee: actualFee.btc })
    .debitAccount({
      accountDescriptor: toLedgerAccountDescriptor(senderWalletDescriptor),
      additionalMetadata: additionalDebitMetadata,
    })
    .creditOffChain()

  return persistAndReturnEntry({ entry, hash: metadata.hash })
}

export const recordLnSendRevert = async ({
  journalId,
  paymentHash,
}: RevertLightningPaymentArgs): Promise<true | LedgerServiceError> => {
  const reason = "Payment canceled"
  try {
    const txMetadataRepo = TransactionsMetadataRepository()

    const savedEntry = await MainBook.void(journalId, reason)
    const journalEntry = translateToLedgerJournal(savedEntry)

    const txsMetadataToPersist = journalEntry.transactionIds.map((id) => ({
      id,
      hash: paymentHash,
    }))
    txMetadataRepo.persistAll(txsMetadataToPersist)
    return true
  } catch (err) {
    return new UnknownLedgerError(err)
  }
}

export const recordLnFailedUsdSendRefund = async ({
  description,
  recipientWalletDescriptor,
  amountToCreditReceiver,
  btcBankFee,
  metadata,
  txMetadata,
  additionalCreditMetadata,
  additionalInternalMetadata,
}: RecordLnFailedUsdSendRefundArgs): Promise<
  LedgerJournal | LedgerServiceError | InvalidLedgerTransactionStateError
> => {
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  const totalBtc = amountToCreditReceiver.btc

  if (btcBankFee.amount > totalBtc.amount) {
    return new InvalidLedgerTransactionStateError(
      `service fee (${btcBankFee.amount}) exceeds refund total (${totalBtc.amount})`,
    )
  }
  const reserveBtc = calc.sub(totalBtc, btcBankFee)

  const recipientAccountDescriptor = toLedgerAccountDescriptor(recipientWalletDescriptor)
  const creditMetadata = { ...metadata, ...additionalCreditMetadata }
  const internalMetadata = { ...metadata, ...additionalInternalMetadata }

  const entry = MainBook.entry(description)
  entry
    .credit(recipientAccountDescriptor.id, Number(totalBtc.amount), {
      ...creditMetadata,
      currency: totalBtc.currency,
    })
    .debit(lndLedgerAccountId, Number(reserveBtc.amount), {
      ...internalMetadata,
      currency: reserveBtc.currency,
    })

  if (btcBankFee.amount > 0n) {
    entry.debit(accountIds.bankOwnerAccountId, Number(btcBankFee.amount), {
      ...internalMetadata,
      currency: btcBankFee.currency,
    })
  }

  return persistAndReturnEntry({ entry, ...txMetadata })
}

export const updateMetadataByHash = async (
  ledgerTxMetadata:
    | OnChainLedgerTransactionMetadataUpdate
    | LnLedgerTransactionMetadataUpdate,
): Promise<true | LedgerServiceError | RepositoryError> =>
  TransactionsMetadataRepository().updateByHash(ledgerTxMetadata)

export const settlePendingLnSend = async (
  paymentHash: PaymentHash,
): Promise<true | LedgerServiceError> => {
  try {
    const result = await Transaction.updateMany({ hash: paymentHash }, { pending: false })
    const success = result.modifiedCount > 0
    if (!success) {
      return new NoTransactionToSettleError()
    }
    return true
  } catch (err) {
    return new UnknownLedgerError(err)
  }
}
