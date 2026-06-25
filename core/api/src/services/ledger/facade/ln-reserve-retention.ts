import { MainBook } from "../books"

import { EntryBuilder } from "../domain"

import { persistAndReturnEntry } from "../helpers"

import { staticAccountIds } from "./static-account-ids"

import { WalletCurrency, ZERO_BANK_FEE, ZERO_CENTS } from "@/domain/shared"

export const recordLnFeeReserveRetained = async ({
  paymentAmount,
  metadata,
}: {
  paymentAmount: BtcPaymentAmount
  metadata: LnReserveRetainedLedgerMetadata
}) => {
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  const bankOwnerAccountDescriptor: LedgerAccountDescriptor<WalletCurrency> = {
    id: accountIds.bankOwnerAccountId,
    currency: WalletCurrency.Btc,
  }

  let entry = MainBook.entry("ln fee reserve retained")
  const builder = EntryBuilder({
    staticAccountIds: accountIds,
    entry,
    metadata,
    additionalInternalMetadata: {},
  })

  entry = builder
    .withTotalAmount({ usdWithFees: ZERO_CENTS, btcWithFees: paymentAmount })
    .withBankFee(ZERO_BANK_FEE)
    .debitOffChain()
    .creditAccount({
      accountDescriptor: bankOwnerAccountDescriptor,
      additionalMetadata: {},
    })

  return persistAndReturnEntry({ entry, hash: metadata.hash })
}
