import { MainBook } from "../books"

import { EntryBuilder, toLedgerAccountDescriptor } from "../domain"
import { persistAndReturnEntry } from "../helpers"

import { staticAccountIds } from "./static-account-ids"

import { AmountCalculator, ZERO_CENTS, ZERO_SATS } from "@/domain/shared"

const calc = AmountCalculator()

type OnChainReceiveSettlementAccount = "onchain" | "lnd"

type RecordReceiveOnChainArgs = RecordReceiveArgs & {
  settlementAccount?: OnChainReceiveSettlementAccount
}

export const recordReceiveOnChain = async ({
  description,
  recipientWalletDescriptor,
  amountToCreditReceiver,
  bankFee,
  metadata,
  txMetadata,
  additionalCreditMetadata,
  additionalInternalMetadata,
  settlementAccount = "onchain",
}: RecordReceiveOnChainArgs) => {
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

  const amountWithFees = {
    usdWithFees: calc.add(amountToCreditReceiver.usd, actualFee.usd),
    btcWithFees: calc.add(amountToCreditReceiver.btc, actualFee.btc),
  }

  const debitBuilder = builder
    .withTotalAmount(amountWithFees)
    .withBankFee({ usdBankFee: actualFee.usd, btcBankFee: actualFee.btc })

  // Legacy LND onchain addresses settle into LND's wallet, so the asset-side
  // ledger entry must use the LND account even though the transaction is onchain.
  const creditBuilder =
    settlementAccount === "lnd"
      ? debitBuilder.debitOffChain()
      : debitBuilder.debitOnChain()

  entry = creditBuilder.creditAccount({
    accountDescriptor: toLedgerAccountDescriptor(recipientWalletDescriptor),
    additionalMetadata: additionalCreditMetadata,
  })

  return persistAndReturnEntry({ entry, ...txMetadata })
}
