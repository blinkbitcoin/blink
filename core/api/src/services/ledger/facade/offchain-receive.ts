import { MainBook } from "../books"

import { EntryBuilder, lndLedgerAccountId, toLedgerAccountDescriptor } from "../domain"
import { persistAndReturnEntry } from "../helpers"

import { staticAccountIds } from "./static-account-ids"

import { InvalidLedgerTransactionStateError } from "@/domain/errors"
import { AmountCalculator, WalletCurrency, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"

const calc = AmountCalculator()

export const recordReceiveOffChain = async ({
  description,
  recipientWalletDescriptor,
  amountToCreditReceiver,
  bankFee,
  externalId,
  metadata,
  txMetadata,
  additionalCreditMetadata,
  additionalInternalMetadata,
}: RecordReceiveArgs) => {
  const actualFee = bankFee || { usd: ZERO_CENTS, btc: ZERO_SATS }
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  let entry = MainBook.entry(description)
  const builder = EntryBuilder({
    staticAccountIds: accountIds,
    externalId,
    entry,
    metadata,
    additionalInternalMetadata,
  })

  const amountWithFees = {
    usdWithFees: calc.add(amountToCreditReceiver.usd, actualFee.usd),
    btcWithFees: calc.add(amountToCreditReceiver.btc, actualFee.btc),
  }

  entry = builder
    .withTotalAmount(amountWithFees)
    .withBankFee({ usdBankFee: actualFee.usd, btcBankFee: actualFee.btc })
    .debitOffChain()
    .creditAccount({
      accountDescriptor: toLedgerAccountDescriptor(recipientWalletDescriptor),
      additionalMetadata: additionalCreditMetadata,
    })

  return persistAndReturnEntry({ entry, ...txMetadata })
}

// Refunds an external LN send that FAILED asynchronously from a USD wallet, in a
// SINGLE journal that mirrors the BTC path's `MainBook.void` — re-issued
// forward-as-BTC because the USD hedge blocks `void` (voiding would restore a USD
// liability that stablesats has already stopped hedging → uncovered FX exposure).
//
// Each account is unwound by its OWN send-amount, exactly as `void` does:
//   debit lnd        = total − bankFee   (what lnd received at send: amount + reserve)
//   debit bank-owner = bankFee           (what bank-owner received at send: the service fee)
//   credit user-BTC  = total             (refund-as-BTC; keeps the dealer conversion final)
// The only deviation from `void` is crediting the BTC wallet instead of un-debiting
// the USD wallet (the deliberate refund-as-sats FX treatment). Pure-sats, so NO
// dealer legs. Raw medici: EntryBuilder is one-debit / bank-owner-credit-skim and
// cannot put bank-owner on the debit side (precedent: FeeOnlyEntryBuilder).
//
// Generalizes the old `recordReceiveOffChain`-based refund: when bankFee = 0 the
// bank-owner debit drops out and this degenerates to `debit lnd total / credit user
// total` — byte-identical to the prior reimburse. The user-credit leg keeps the
// caller's `LnFailedPaymentReceiveLedgerMetadata` so the refund still displays in
// history; the debit legs carry internal metadata. (spec ln-service-fee-extraledger.md,
// Change Log #13 — supersedes the two-journal #8/#9 reimburse + reversal.)
export const recordLnFailedUsdSendRefund = async ({
  description,
  recipientWalletDescriptor,
  amountToCreditReceiver,
  btcBankFee,
  metadata,
  txMetadata,
  additionalCreditMetadata,
  additionalInternalMetadata,
}: RecordLnFailedUsdSendRefundArgs) => {
  // Refund-as-BTC: the user-credit leg carries a sats amount tagged BTC, so it must
  // land on a BTC wallet — never corrupt a USD account with a BTC-currency leg.
  if (recipientWalletDescriptor.currency !== WalletCurrency.Btc) {
    return new InvalidLedgerTransactionStateError(
      `recordLnFailedUsdSendRefund requires a BTC recipient wallet, got ${recipientWalletDescriptor.currency}`,
    )
  }

  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  const totalBtc = amountToCreditReceiver.btc
  // The service fee is always a strict subset of the total (principal + routing
  // reserve + fee), so the lnd reserve = total − bankFee is > 0. Guard the invariant
  // rather than silently committing a negative/unbalanced leg (raw medici has no
  // EntryBuilder underflow/zero-leg safety net).
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

  entry.credit(recipientAccountDescriptor.id, Number(totalBtc.amount), {
    ...creditMetadata,
    currency: totalBtc.currency,
  })

  if (reserveBtc.amount > 0n) {
    entry.debit(lndLedgerAccountId, Number(reserveBtc.amount), {
      ...internalMetadata,
      currency: reserveBtc.currency,
    })
  }

  if (btcBankFee.amount > 0n) {
    entry.debit(accountIds.bankOwnerAccountId, Number(btcBankFee.amount), {
      ...internalMetadata,
      currency: btcBankFee.currency,
    })
  }

  return persistAndReturnEntry({ entry, ...txMetadata })
}
