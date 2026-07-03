import { MainBook } from "../books"

import { FeeOnlyEntryBuilder } from "../domain/fee-only-entry-builder"

import { persistAndReturnEntry } from "../helpers"

import { staticAccountIds } from "./static-account-ids"

export const recordLnFeeReserveRetained = async ({
  paymentAmount,
  metadata,
}: {
  paymentAmount: BtcPaymentAmount
  metadata: LnReserveRetainedLedgerMetadata
}): Promise<LedgerJournal | LedgerServiceError> => {
  const accountIds = await staticAccountIds()
  if (accountIds instanceof Error) return accountIds

  let entry = MainBook.entry("ln fee reserve retained")
  const builder = FeeOnlyEntryBuilder({
    staticAccountIds: accountIds,
    entry,
    metadata,
    btcFee: paymentAmount,
  })

  entry = builder.debitOffChain().creditBankOwner()

  return persistAndReturnEntry({ entry, hash: metadata.hash })
}
