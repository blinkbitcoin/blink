import { MainBook } from "../books"

import { EntryBuilder } from "../domain"

import { persistAndReturnEntry } from "../helpers"

import { staticAccountIds } from "./static-account-ids"

import { LedgerTransactionType } from "@/domain/ledger"
import { WalletCurrency, ZERO_BANK_FEE, ZERO_CENTS } from "@/domain/shared"

import { toSats } from "@/domain/bitcoin"

import { toCents } from "@/domain/fiat"

export const LN_FAILED_USD_SEND_SERVICE_FEE_REVERSAL_MEMO =
  "Service fee reversal on failed USD payment"

export const recordBankownerReconciliation = async ({
  description,
  amount,
}: RecordBankownerReconciliationArgs) => {
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  const bankOwnerAccountDescriptor: LedgerAccountDescriptor<WalletCurrency> = {
    id: accountIds.bankOwnerAccountId,
    currency: WalletCurrency.Btc,
  }
  const metadata = {
    type: LedgerTransactionType.Reconciliation,
    currency: WalletCurrency.Btc,
    pending: false,
    satsAmount: toSats(amount.btc.amount),
    satsFee: toSats(0),
    centsAmount: toCents(amount.usd.amount),
    centsFee: toCents(0),
  }

  let entry = MainBook.entry(description)
  const builder = EntryBuilder({
    staticAccountIds: accountIds,
    entry,
    metadata,
    additionalInternalMetadata: {},
  })

  entry = builder
    .withTotalAmount({ usdWithFees: amount.usd, btcWithFees: amount.btc })
    .withBankFee(ZERO_BANK_FEE)
    .debitAccount({
      accountDescriptor: bankOwnerAccountDescriptor,
      additionalMetadata: {},
    })
    .creditOffChain()

  return persistAndReturnEntry({ entry })
}

// Reverses the bank-owner service-fee credit booked on an external LN send when
// that send later FAILS asynchronously from a USD wallet. Unlike the BTC path
// (which VOIDs the whole journal, auto-reversing the credit), the USD path settles
// the original journal and reimburses the user the total — so the bank-owner credit
// must be reversed explicitly, else it becomes orphan revenue on a failed payment
// (spec ln-service-fee-extraledger.md, AC5 / Change Log #8).
//
// BTC-only: the credit was booked in sats per the spec's "BTC-only on the ledger".
// usd is passed as ZERO so NO dealer legs are created (mirrors the BTC-only pattern).
// Net of this debit-bankOwner / credit-offChain(lnd) entry: bank-owner → 0 (no
// revenue on failure); the lnd account — which funded the user's amount+total
// reimburse but only received amount+reserve at send — is made whole by +service.
//
// Reuses LedgerTransactionType.Reconciliation (as recordBankownerReconciliation
// does); no new LedgerTransactionType is added (frozen spec). The payment hash is
// attached for traceability; the entry has no end-user wallet leg, so it does not
// affect LnPaymentStateDeterminator (which is queried by end-user walletIds).
export const recordLnFailedSendServiceFeeReversal = async ({
  paymentHash,
  btcBankFee,
}: RecordLnFailedSendServiceFeeReversalArgs) => {
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  const bankOwnerAccountDescriptor: LedgerAccountDescriptor<WalletCurrency> = {
    id: accountIds.bankOwnerAccountId,
    currency: WalletCurrency.Btc,
  }
  const metadata = {
    type: LedgerTransactionType.Reconciliation,
    currency: WalletCurrency.Btc,
    pending: false,
    hash: paymentHash,
    satsAmount: toSats(btcBankFee.amount),
    satsFee: toSats(0),
    centsAmount: toCents(0),
    centsFee: toCents(0),
  }

  let entry = MainBook.entry(LN_FAILED_USD_SEND_SERVICE_FEE_REVERSAL_MEMO)
  const builder = EntryBuilder({
    staticAccountIds: accountIds,
    entry,
    metadata,
    additionalInternalMetadata: {},
  })

  entry = builder
    .withTotalAmount({ usdWithFees: ZERO_CENTS, btcWithFees: btcBankFee })
    .withBankFee(ZERO_BANK_FEE)
    .debitAccount({
      accountDescriptor: bankOwnerAccountDescriptor,
      additionalMetadata: {},
    })
    .creditOffChain()

  return persistAndReturnEntry({ entry, hash: paymentHash })
}
