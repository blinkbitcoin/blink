import * as caching from "../caching"

import { recordIntraledger } from "./intraledger"
import {
  InactivityFeeLedgerMetadata,
  InactivityFeeRefundLedgerMetadata,
} from "./tx-metadata"

import {
  checkedToInactivityFeeExternalId,
  InactivityFeeExternalIdKind,
  inactivityFeeMemo,
  inactivityFeeRefundMemo,
} from "@/domain/inactivity-fee"
import { UnknownLedgerError } from "@/domain/ledger"
import { WalletCurrency } from "@/domain/shared"

// bankowner holds BTC only; a USD wallet is balanced through the dealer legs
const bankOwnerWalletDescriptor = async (): Promise<
  LedgerWalletDescriptor<"BTC"> | LedgerServiceError
> => {
  try {
    return { id: await caching.getBankOwnerWalletId(), currency: WalletCurrency.Btc }
  } catch (err) {
    return new UnknownLedgerError(err)
  }
}

// the only poster of `inactivity_fee`: user wallet → bankowner
export const recordInactivityFee = async ({
  walletDescriptor,
  amount,
  externalId,
  metadata: provenance,
}: RecordInactivityFeeArgs): Promise<
  LedgerJournal | ValidationError | LedgerServiceError
> => {
  const checkedExternalId = checkedToInactivityFeeExternalId({
    externalId,
    kind: InactivityFeeExternalIdKind.Fee,
    walletId: walletDescriptor.id,
  })
  if (checkedExternalId instanceof Error) return checkedExternalId

  const bankOwner = await bankOwnerWalletDescriptor()
  if (bankOwner instanceof Error) return bankOwner

  const memo = inactivityFeeMemo({
    currency: walletDescriptor.currency,
    sats: amount.btc.amount,
    cents: amount.usd.amount,
    rate: provenance.rate,
  })
  const {
    metadata,
    debitAccountAdditionalMetadata,
    creditAccountAdditionalMetadata,
    internalAccountsAdditionalMetadata,
  } = InactivityFeeLedgerMetadata({ amount, memo, provenance })

  return recordIntraledger({
    description: memo,
    senderWalletDescriptor: walletDescriptor,
    recipientWalletDescriptor: bankOwner,
    amount,
    externalId: checkedExternalId,
    metadata,
    additionalDebitMetadata: debitAccountAdditionalMetadata,
    additionalCreditMetadata: creditAccountAdditionalMetadata,
    additionalInternalMetadata: internalAccountsAdditionalMetadata,
  })
}

// the only poster of `inactivity_fee_refund`: bankowner → user wallet, the debit's exact amounts
export const recordInactivityFeeRefund = async ({
  walletDescriptor,
  amount,
  externalId,
  metadata: provenance,
}: RecordInactivityFeeRefundArgs): Promise<
  LedgerJournal | ValidationError | LedgerServiceError
> => {
  const checkedExternalId = checkedToInactivityFeeExternalId({
    externalId,
    kind: InactivityFeeExternalIdKind.Refund,
    walletId: walletDescriptor.id,
  })
  if (checkedExternalId instanceof Error) return checkedExternalId

  const bankOwner = await bankOwnerWalletDescriptor()
  if (bankOwner instanceof Error) return bankOwner

  const memo = inactivityFeeRefundMemo({
    currency: walletDescriptor.currency,
    sats: amount.btc.amount,
    cents: amount.usd.amount,
  })
  const {
    metadata,
    debitAccountAdditionalMetadata,
    creditAccountAdditionalMetadata,
    internalAccountsAdditionalMetadata,
  } = InactivityFeeRefundLedgerMetadata({ amount, memo, provenance })

  return recordIntraledger({
    description: memo,
    senderWalletDescriptor: bankOwner,
    recipientWalletDescriptor: walletDescriptor,
    amount,
    externalId: checkedExternalId,
    metadata,
    additionalDebitMetadata: debitAccountAdditionalMetadata,
    additionalCreditMetadata: creditAccountAdditionalMetadata,
    additionalInternalMetadata: internalAccountsAdditionalMetadata,
  })
}
